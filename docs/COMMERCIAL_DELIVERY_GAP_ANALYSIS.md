# 商业交付缺陷分析报告（Ox Shopping）

> ⚠️ **状态更新（2026-09-21）**：本报告列出的 **8 项代码级缺陷已全部整改完成**，
> 另完成分销专项与全项目隐藏问题扫雷的 P0/P1 批量修复。
> 明细与验证证据见 [COMMERCIAL_READINESS_FIXES_2026-09-21.md](COMMERCIAL_READINESS_FIXES_2026-09-21.md)；
> 延伸审查见 [DISTRIBUTION_COMMERCIAL_AUDIT.md](DISTRIBUTION_COMMERCIAL_AUDIT.md) 与
> [PROJECT_HIDDEN_ISSUES_SWEEP.md](PROJECT_HIDDEN_ISSUES_SWEEP.md)。
> 本文保留为**当初的分析快照**（未逐条改写），以免丢失问题发现过程。

> 分析日期：2026-09-20 · 分析人：梦哥
> 方法：5 路并行深查（支付资金流 / 安全 / 业务逻辑 / 商业缺口 / 生产部署）+ 核心代码逐行人工核查
> 基线：项目已经过 13 轮自查（见 findings.md），tsc 0 错 · eslint 0 errors · 单测 268 用例 · E2E 14 用例全绿
> 本报告只读代码、未修改任何业务文件

---

## 一、总体评价

**骨架质量高于一般开源 demo，主要差距不在代码质量而在商业功能完整度。**

做得真实现的部分（已核查无问题）：
- 防超卖：事务内 `FOR UPDATE` 行锁 + `updateMany WHERE stock>=qty` 双保险（order.service.ts:386,476-486）
- 支付确认幂等：`markOrderPaid` 原子认领，并发/重放安全（order.service.ts:791-812）
- 退款：部分退款行锁+累计封顶 → 审批 → 网关退款 → 累计覆盖全额才整单 REFUNDED，三路通知闭环
- 券体系：行锁核销 + `(couponId,orderId)` 唯一键幂等 + 取消/退款回补 + 每人限次 + 封顶（coupon.service.ts 全文）
- 金额单一事实来源：试算与下单共用 `computeOrderAmounts`，不接受前端金额（order.service.ts:150-165）
- 会话轮换：事务原子 + 重放检测 + 60s 善意复用宽限期（session.ts:175-260）
- RBAC：全部 30 个 admin API 路由都有守卫；敏感操作全部 `requireAdmin`
- CSRF double-submit、CSP per-request nonce、强密钥启动守卫、订单越权统一 403 + 常量时间比较

差距集中的三个方向：
1. **真实收款**：只有 Stripe 可用；支付宝/微信/PayPal/银行卡全是 stub；生产漏配 Stripe 时静默免费下单
2. **运营工具**：管理端订单不可编辑、客服留言无收件箱、物流纯手工
3. **增长设施**：无评价晒单、无埋点、无邮件营销

---

## 二、代码级缺陷（按严重度）

### A1.【高】生产漏配 Stripe 时静默进入「免费下单」模式
- `env.ts:137-176` 的启动守卫只覆盖 JWT/渠道加密密钥/品牌名/发件人，**不守卫支付模式**
- `PAYMENT_MODE` 默认 `auto`（env.ts:40），无 Stripe key → `effectivePaymentMode="mock"`（env.ts:206-210）
- docker-compose 生产默认 `PAYMENT_MODE:-auto`、`STRIPE_SECRET_KEY:-`（空）——不填 Stripe 密钥也能启动
- 后果：下单 → 模拟支付页 → `mock-pay`（`effectivePaymentMode==="mock"` 通过）→ 订单标"已支付"、**真实收款为 0**
- 只有 README checklist 文字提醒，代码无硬守卫（对比 JWT 密钥有启动拒绝）
- **建议**：`NODE_ENV=production` 且 mock 模式时启动告警或要求显式 `ALLOW_MOCK_PAYMENT_IN_PROD=true`

### A2.【高】COD（货到付款）订单业务逻辑矛盾
- COD 订单创建为 `PENDING_PAYMENT`（order.service.ts:508），无任何 COD 豁免
- `expireStaleOrders` 按 `PENDING_PAYMENT`+超时取消（order.service.ts:989-1005），**无 isCashOnDelivery 过滤** → COD 订单 30 分钟后必被自动取消
- 结账页选 COD 仍必须选支付渠道（checkout-flow.tsx:517-528），POST 无条件 `createPaymentUrl`（orders/route.ts:118-120）→ COD 客户被带去**线上**支付页
- 若在线支付成功 → PAID → 送达时又要收现金 = 双重收款语义；不支付 → 30 分钟死单
- "Pay on delivery ¥X" 只在前端展示（checkout-flow.tsx:781-786），COD 金额**没有落库订单**（shipping.service.ts:76-83 fee=0）→ 仓库/客服不知道该收多少现金
- **建议**：COD 单跳过支付环节、到付金额落库、过期取消豁免 COD

### A3.【中】渠道化 Stripe 的掉单对账被 env 模式误关
- `scheduler.ts:112` `if (effectivePaymentMode === "stripe")` 只看 env，不看渠道配置
- 场景：后台配置 Stripe 渠道（渠道密钥收款）+ env `PAYMENT_MODE=mock/auto无key` → 对账 cron 跳过
- webhook 丢失/签名配错时：钱已收、订单永不 PAID，且无兜底
- **建议**：门控改为「env stripe **或** 渠道 stripe 已配置即对账」

### A4.【中】多币种换算分账漂移（财务一致性）
- `order.service.ts:433-437` `toUserCurrency` 对每个分量独立四舍五入；注释声称"转换后所有明细之和等于总金额"（order.service.ts:432）但**实测可差 1 分**（rate=7.246891、含折扣时验证复现：明细和 90.58 vs 总额 90.59）
- 订单行 subtotal（order.service.ts:553）与订单级 subtotal 同理可能不一致
- 全测试套件**无该恒等式的覆盖**（grep tests 无 toUserCurrency/exchangeRate 引用）
- **建议**：先换算总额，再按最大余额法分摊明细；补财务一致性单测

### A5.【中低】mock provider 丢游客查单令牌（客户端已兜底）
- `providers/mock.ts` `createPayment` → `createMockPaymentUrl(input.orderNumber)` 未传 accessToken（`CreatePaymentInput` 无该字段）
- legacy 路径（mock.ts:19-27）与 order.service 渠道分支（order.service.ts:639-641）都正确传 token
- 结算页客户端补 token（checkout-flow.tsx:569-576）兜住了主链路
- 残余风险：paymentUrl 的其他使用方（如后台复制支付链接给客户）不带 token → 403
- **建议**：`CreatePaymentInput` 增加 accessToken 字段，服务端统一注入

### A6.【低】Stripe 双 Session 竞态残余（双重收款理论路径）
- `createPaymentUrl` 的会话复用检查 `order.paymentSessionId`（order.service.ts:694-707,738-751）非原子：并发双击可创建两个 open session
- 双 session 都支付 → 第一个 webhook 标 PAID；第二个 webhook 发现非 PENDING 直接返回 → **顾客被收两次款，第二笔无自动退款**
- 掉单对账只查 `PENDING_PAYMENT` 订单（scheduler.ts:123-127），PAID 订单上的第二笔支付无检测
- **建议**：建 session 前条件更新原子占位；或 webhook 对已 PAID 订单的第二笔支付自动退款

### A7.【低】mock 渠道未按环境门控
- mock provider `isConfigured` 恒 true、无 `isReady`（providers/mock.ts:13-17）→ 前台 `available=true`（channel.service.ts:87-90）
- 生产 `PAYMENT_MODE=stripe` 时「模拟支付」仍作为可选渠道展示（选中后必死，见 A1）；`PAYMENT_MODE=mock` 生产配置下是免费下单
- **建议**：production 环境 mock 渠道 `available=false`，或渠道种子默认禁用 mock

---

## 三、安全核查结果

已核查无问题：CSRF double-submit（cookie≥32 位+头同值+SameSite=Lax）、admin RBAC 全覆盖且敏感操作 `requireAdmin`、JWT HS256 固定算法+强密钥启动守卫、会话轮换重放检测、订单越权统一 403+常量时间比较、地址引用带 userId 过滤、找回密码防枚举、上传 MIME 白名单（无 SVG）+随机文件名+purpose 白名单、CSP nonce、`.env` 已 git-ignore、限流 Redis Lua 原子+LRU 降级。

### B1.【中】IP 限流可绕过 / 可塌缩
- `getClientIp`（utils-server.ts:13-25）：`TRUST_PROXY=true`（生产默认）取 XFF 最后一跳——compose 把 3000 端口发布到宿主机，直连 app 可伪造 XFF 每次换 IP，绕过登录/注册/下单限流
- `TRUST_PROXY=false` 且无 XFF 时返回 `"unknown"`——**所有客户端共享同一个限流桶**：注册 3/min 全站塌缩、下单 5/10min 全站塌缩
- **建议**：非代理环境回退 socket IP；生产防火墙封 3000 直连（只留 nginx）

### B2.【中】Redis 生产无密码且端口发布到宿主机
- docker-compose.yml：redis-server 无 `requirepass`、`ports 6379:6379`；postgres `5432:5432` 同理
- 宿主机有公网 IP 且防火墙未拦时，Redis 未授权访问 = 数据泄露/FLUSHALL
- **建议**：Redis 加密码 + 移除 ports 发布（仅 compose 内部网络）

### B3.【低】/api/uploads/ CSRF 豁免面略宽
- 豁免前缀覆盖整个 `/api/uploads/`（proxy.ts:34）；实际 presign 在 `/api/admin/uploads/presign`（不在豁免内，有 CSRF）
- 已核对无实际漏洞，记录在案

---

## 四、商业交付缺口（对照「真实开门做生意」）

### P0（最要命，明天收款就卡在这）
| 缺口 | 现状（已验证） | 工作量 |
|---|---|---|
| ① 真实收款通道只有 Stripe | alipay/wechat/bankcard/paypal 四渠道 createPayment 直接 throw「not wired up yet」（providers/alipay.ts:73-77，isReady=false）；中国客户付不了款，Stripe 又不收 CNY | 申请商户号+对接（大） |
| ② 客服留言无后台收件箱 | ContactMessage 只在 src/app/api/contact/route.ts 出现，全 src 无任何后台读取（grep 验证）；留言只落库+发邮件，第一周真实留言必漏 | 一天（UI 缺口） |
| ③ 管理端订单不可编辑 | admin orders API 仅 assign/ship/status/tracking/export/unread（ls 验证）；改地址/改商品/加备注都没有，只能动数据库 | 数天 |
| ④ 邮件通道生产红线 | `MAIL_PROVIDER:-console` 默认（compose）：订单确认/发货/临时密码全部不投递；生产必须 resend/smtp+真实域名+SPF/DKIM，否则找回密码对用户不可用 | 配置项 |
| ⑤ 生产 mock 守卫缺失 | 见 A1/A7 | 半天 |

### P1（重要，运营顺畅度）
- 多规格 SKU 局限：JSON `attributes`+`specStock`，无 `ProductVariant`——规格级定价/SKU 码/条码做不了（服饰同价可跑）
- 商品批量导入导出缺失（只有订单 CSV 导出，有 CSV 注入单测）
- 库存预警：仪表盘 `lowStockCount`（stock≤5 写死、无阈值配置、无推送、无规格级）
- 拆单/部分发货无 `Shipment` 实体；订单无批量操作（商品有）
- 物流纯手工录单号，未接快递100/AfterShip，无轨迹事件
- 发票 PDF 无税号/普票专票类型/抬头税号申请
- 税务只有 env `TAX_RATE`（0=含税对齐欧盟站）；代码注释自认 `TAX_RATE>0` 时结算页缺 Tax 行（order.service.ts:148）；无地区税则/跨境申报
- 对账报表：无日结/月结、无财务导出、无毛利报表（`costPrice` 字段闲置）
- 邮件营销：12 套事务邮件之外无订阅名单/退订中心/群发（须先做 double opt-in）
- 7 天无理由退货：无系统校验（`REFUNDABLE_STATUSES` 只按状态不看天数）
- 性能：全 shop 页面 `force-dynamic` 逐请求 SSR，无 ISR/静态化 PDP（中量级流量瓶颈）；商品列表 Redis 缓存 TTL 60s 可扛早期
- 定时上架缺失（Product 仅 DRAFT/ACTIVE/ARCHIVED）
- GA4/埋点全无（layout 无 gtag）——买量决策刚需

### P2（可后）
- Cookie 同意无分类同意/同意留痕存储、无预同意脚本拦截
- 评价晒单（列为 P1 若开始买量）、换货流程、积分/会员等级、价格历史/调价记录
- 搜索分析（热搜词）、转化漏斗、RFM 用户分群
- PWA（无 manifest/service-worker）、第三语言、商品页 CDN

---

## 五、生产部署核查

已核查无问题：Docker 多阶段构建（standalone 输出、非 root 用户、healthcheck）、compose 依赖 healthcheck 条件+密钥 `:?` 拒启+`SEED_ON_START=false` 防种子覆盖、CI 四 job 完整（lint/typecheck/单测集成/生产构建/E2E）、迁移策略（migrations+migrate deploy）、备份脚本（pg_dump+gzip 14 天）、nginx.conf（SSL/HTTP2/gzip）。

| 缺口 | 严重度 | 说明 |
|---|---|---|
| CI 无部署 job、无镜像 registry | 中 | 上线是手动 docker compose；无 dependabot/npm audit 依赖漏洞扫描 |
| 无 metrics 端点/无告警 | 中 | 无 Prometheus；Sentry 可选（SENTRY_DSN） |
| `db push` 生产回退路径 | 低 | ENTRYPOINT 无迁移历史时 fallback `db push`（有 migrations 目录时不会走到；生产 schema 漂移风险） |
| 无容器资源限制 | 低 | 无 mem_limit/cpus |
| `MAIL_FROM` 默认 example.com | 低 | compose 默认值，忘改则邮件投递受影响 |
| 水平扩容阻碍点 | 低 | cron 咨询锁选主（OK）；内存降级限流与本地存储需全量切 Redis/S3（compose 生产已默认可配） |

---

## 六、建议路线图

**第一周（能收钱、不丢单）：**
1. 支付商户号 + Stripe 真实收款配置（P0 配置项）
2. 邮件通道配置与域名验证 SPF/DKIM（P0 配置项）
3. 生产 mock 守卫 + mock 渠道环境门控（A1/A7，半天代码）
4. 客服收件箱 UI（P0，一天）
5. Redis 密码 + 端口回收（B2）

**第二周～一个月（运营顺畅）：**
6. 订单编辑（改地址/备注）+ 订单批量操作
7. COD 业务语义修正：跳过支付/到付金额落库/过期豁免（A2）
8. 渠道化 Stripe 对账门控修正（A3）
9. 多币种分账恒等式修正 + 补财务一致性测试（A4）
10. 库存预警阈值配置+推送；商品批量导入导出

**一个月后（增长）：**
11. 评价晒单 + GA4/埋点
12. ProductVariant 多规格、物流轨迹对接、邮件营销（double opt-in）
13. 财务日报/月报导出、PDP ISR、发票税号

---

## 附：本次核查确认「无问题」的高风险方向清单
- 并发支付幂等（markOrderPaid 原子认领）✅
- Stripe webhook 金额+币种双校验（webhooks/stripe/route.ts:50-79）✅
- 部分退款累计封顶（refund route 事务+行锁）✅
- 券并发核销（FOR UPDATE + 唯一键幂等）✅
- 防超卖（行锁+条件更新双保险）✅
- 渠道密钥存储（AES-256-GCM，密钥来自 env，后台脱敏回显）✅
- 库存回补全路径覆盖（取消/整单退款/网关退款）✅
- 订单越权与游客令牌（常量时间比较+统一 403）✅
- admin RBAC（30 路由全覆盖，敏感操作 requireAdmin）✅
- 强密钥/品牌名/发件人启动守卫 ✅

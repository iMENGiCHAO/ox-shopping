# 商业交付运营就绪度审计报告（2026-08-25）

> 审计人：梦哥 ｜ 方式：全仓静态分析（不修改任何代码）
> 范围：Next.js 14 + Prisma/PostgreSQL + Redis + Stripe + S3 全栈电商（星辰商城）
> 基线：`git log` 15 个提交，已有 docs/COMMERCIAL_READINESS.md、PRODUCTION_CHECKLIST.md、RUNBOOK-multi-instance.md

## 〇、总体结论

项目工程成熟度在同类自研电商里属于**中上水平（约 88%）**：交易闭环、认证安全、支付幂等、三层测试、Docker 交付、CI 均已具备。
距离"对外收费运营"的主要差距**不再是功能缺失，而是资金正确性边界、生产部署工程化和安全加固细节**。
其中 P0 有 5 项，属于"上线即可能出资金事故或安全事故"的级别，建议上线前全部关闭。

| 维度 | 评分 | 一句话评价 |
| --- | --- | --- |
| 交易正确性（库存/支付/退款） | ★★★★☆ | 库存与支付幂等做得好；退款 webhook 与券限额有漏洞 |
| 安全（认证/CSRF/CSP） | ★★★★☆ | 底座扎实；限流可被 XFF 绕过、券码可枚举 |
| 可观测性 | ★★★☆☆ | 结构化日志 + 请求 ID 到位；Sentry 覆盖不全 |
| 性能与缓存 | ★★★☆☆ | 全站动态渲染、缓存前缀脏数据、KEYS 扫库 |
| 部署与运维 | ★★★★☆ | Docker/CI/Nginx 齐备；启动种子与密钥管理需收紧 |
| 合规与运营 | ★★★☆☆ | 政策页/GDPR 齐备；发票税务、客服、异地备份待落地 |
| 测试质量 | ★★★★☆ | 三层测试齐备；支付/退款/并发关键路径缺集成用例 |

---

## 一、P0 —— 上线前必须修复（资金/安全/数据事故级别）

### 1. Stripe Webhook 一律返回 400，丢重试 + 部分退款误判整单退款

文件：[webhook 路由](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/api/webhooks/stripe/route.ts>)

两个独立问题：

1. **错误码语义错误**：`catch` 块把所有异常统一返回 `400`。Stripe 的语义是 4xx 不重试、5xx 重试。
   当前若 `markOrderPaid` 因数据库瞬时故障失败，事件**永远不会被重放**，订单卡在"已支付但本地未标记"，只能靠对账任务兜底——对账有 10 分钟延迟且每轮只有 50 单。
   **修复方向**：签名校验失败 → 400；事件处理失败 → 500（或对已消费事件落库后返回 200）。

2. **部分退款误判整单退款**：`charge.refunded` 事件在**任意金额**退款（含部分退款）时都会触发，
   当前代码无条件执行 `updateOrderStatus(order, "REFUNDED")` 并把该订单**所有**退款记录置为 REFUNDED。
   这与管理端"部分退款不改变整单状态"的逻辑直接矛盾——一笔 10 元的部分退款会把整单标记为全额退款，
   后续退款申请与统计全部失真。
   **修复方向**：webhook 里先汇总已退金额，仅当累计 ≥ 订单总额时才置整单 REFUNDED；只更新对应退款单。

### 2. 退款审批"先检查后打款"非原子，并发可重复退款

文件：[退款审批路由](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/api/admin/refunds/[id]/route.ts>)

`if (refund.status !== "REQUESTED") throw` 是"先读后写"模式：两个管理员（或双击）并发审批同一笔退款时，
两次都通过检查 → **对 Stripe 发起两笔线上退款**，第二笔 update 覆盖第一笔的 `gatewayRefundId`，流水只有一条。

**修复方向**：先 `updateMany({ where: { id, status: "REQUESTED" }, data: { status: "APPROVING" } })` 原子认领，
认领成功者再调 Stripe；或对退款行 `SELECT ... FOR UPDATE`。

### 3. 限量优惠券在"下单时"不占额度，限额形同虚设

文件：[订单服务 createOrder / markOrderPaid](</Volumes/Time Machine/DeepSeek/ecommerce/src/server/services/order.service.ts>)

`findUsableCoupon` 检查的 `usedCount` 只在 `markOrderPaid`（支付成功）时才 +1，
且下单事务只写入 `CouponRedemption` 记录、不校验 usageLimit。
后果：usageLimit=100 的券，在 100 张未支付订单占位后，第 101～N 张订单**创建时照常打折**；
支付时"已达上限"只会跳过 +1，**已给出去的折扣不会收回**。另 `usedCount` 的"读-判-增"存在 TOCTOU，并发支付可超发。

**修复方向**：下单事务内对券行 `FOR UPDATE`，把 `usageLimit` 校验改为"已支付 + 待支付订单占用数"；或支付时对超额订单追回折扣（体验差）。至少把递增改为原子条件更新。

### 4. 限流可被 X-Forwarded-For 伪造绕过（登录/注册/重置密码）

文件：[getClientIp](</Volumes/Time Machine/DeepSeek/ecommerce/src/lib/utils.ts>) · [登录路由](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/api/auth/login/route.ts>)

`getClientIp` 直接信任客户端传入的 `x-forwarded-for` 首段。
只要应用端口（docker-compose 直接暴露 3000）未置于可信反代之后，攻击者改一个请求头即可无限换 IP，
**登录/注册/忘记密码/重置密码的限流全部可绕过**。另一个副作用：无 XFF 的请求共享 `"unknown"` 桶，可被单点打满连累他人。

**修复方向**：只在配置了可信代理（如 `TRUST_PROXY=1`）时才取 XFF，否则取 socket 地址；或部署要求仅经 Nginx/CDN 访问并固定 IP 数。配合按账号维度的失败锁定（当前只有 IP+邮箱组合限流，分布式 IP 可逐个账号爆破）。

### 5. 生产凭据与启动流程：明文密钥、容器内 seed、环境备份入库

- [docker-compose.yml](</Volumes/Time Machine/DeepSeek/ecommerce/docker-compose.yml>) 明文写入 `minioadmin`、DB 密码、`REQUIRE_STRONG_SECRETS=false`——只能当本地演示模板，**生产复制即事故**。应改为 `${VAR:?err}` 引用外部环境。
- [Dockerfile](</Volumes/Time Machine/DeepSeek/ecommerce/Dockerfile>) 的 ENTRYPOINT 每次容器启动都执行 `migrate deploy` + `db seed || true`：
  多副本同时启动会竞争迁移；seed 即使非破坏性也不该进生产启动路径。迁移应作为独立发布步骤（或单副本 init job）。
- `.settings.yaml.bak` 已被 git 跟踪（环境/模型配置备份，虽无明文密钥，但属于工作区环境文件入库）。建议从历史中移除并加入 .gitignore。
- 本地 `.env` 已含真实 S3/Stripe/ZHIPU 等凭据（未被跟踪，安全），但**没有密钥轮换与泄漏响应演练**；建议上线前轮换一次并启用 secrets manager。

---

## 二、P1 —— 上线首月内完成（安全/可靠性/合规）

| # | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| 1 | 券码枚举：`/api/coupons/validate`、`/api/coupons/apply` 无鉴权无限制，且错误信息区分"不存在/停用/过期/领完" | [validate](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/api/coupons/validate/route.ts>) | 加限流（IP+code）、错误收敛为通用文案、加失败尝试计数 |
| 2 | CSV 公式注入：订单导出未转义 `= + - @` 开头的单元格（收货人、备注为用户可控） | [csv.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/lib/csv.ts>) | escapeCell 增加公式前缀防护（`'` 或 `\t`） |
| 3 | 邮件静默失败：`sendMail` 吞掉所有异常，注册验证/找回密码邮件丢失时用户无感知、无重试 | [mail/index.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/lib/mail/index.ts>) | 关键邮件（验证/重置）失败应反馈或入队重试；邮件语言默认跟随用户/站点语言（当前默认 en，中文用户收英文邮件） |
| 4 | 全站 `force-dynamic`：连政策页/FAQ/无障碍声明都每次回源 DB | [布局](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/(shop)/layout.tsx>) 等 19 处 | 静态政策页改静态导出/ISR；首页与列表页评估 ISR + 客户端个性化区块 |
| 5 | Sentry 覆盖不全：仅 `apiHandler` 捕获 5xx；页面渲染错误、Webhook、全局错误边界只 console.error，无 `@sentry/nextjs`/instrumentation | [monitoring.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/lib/monitoring.ts>) · [error.tsx](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/error.tsx>) | 引入 `@sentry/nextjs` 或至少在 instrumentation/错误边界补 captureException；为 webhook/cron 增加告警 |
| 6 | healthz 只回 ok，不探测 DB/Redis 依赖 | [healthz](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/healthz/route.ts>) | 区分 liveness/readiness，readiness 检查 DB + Redis + S3 连通性 |
| 7 | 下单价格快照竞态：事务内锁行后仍用锁前的 `productById` 价格，管理员改价窗口内订单可能按旧价成交 | [order.service.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/server/services/order.service.ts>) | 锁行后一律用 `freshList` 的最新价格重算金额；或改价走"下架-改价-上架"流程 |
| 8 | 备份仅本机目录、无异地、无恢复演练记录（文档自认"待基础设施到位"）；AuditLog 90 天硬删需与 GDPR 删除请求策略核对 | [backup-db.sh](</Volumes/Time Machine/DeepSeek/ecommerce/scripts/backup-db.sh>) | 异地/对象存储备份 + 季度恢复演练；审计日志归档（冷存）而非直接删 |
| 9 | Nginx 静态资源 location 内 `add_header` 覆盖了 server 级安全头（HSTS/XFO），且应用层本身无 HSTS | [nginx.conf](</Volumes/Time Machine/DeepSeek/ecommerce/deploy/nginx.conf>) | 静态 location 补 `add_header`（或用 `always` + include 片段）；应用层补 HSTS 兜底 |
| 10 | 预签名上传无法强制大小/内容：S3 直传绕过 10MB 上限与 MIME 白名单（ContentType 客户端自报） | [presign 路由](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/api/admin/uploads/presign/route.ts>) | Bucket Policy 加 Content-Length 条件；或上传后异步校验/转码（sharp）并删违规对象 |
| 11 | 订单列表 GET 每次触发 `expireStaleOrders()`，与 cron 重复且位于热路径 | [orders 路由](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/api/orders/route.ts>) | 去掉惰性触发，仅保留 cron（或降为低频兜底） |
| 12 | sitemap 收录 `/auth/login`、`/auth/register`，robots 未禁 /auth | [sitemap.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/app/sitemap.ts>) | 移除认证页；robots 增加 `/auth` |

---

## 三、P2 —— 规模化阶段（1-3 个月）

1. **搜索**：`LIKE %q%` 三字段扫描，>5k SKU 上 PostgreSQL FTS / pg_trgm 或 Meilisearch（既有文档已列，未见落地）。
2. **统计查询**：近 14 天趋势把全部订单拉进内存聚合；改为 SQL `date_trunc('day') GROUP BY`，并为仪表盘建预聚合表。
3. **缓存**：
   - [cache.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/lib/cache.ts>) 的前缀常量是 `"{m.group(1)}v2"`——明显是早期批量替换的残留，功能上自洽（写与失效同前缀）但应清理；
   - 缓存失效用 `KEYS` 全量扫 Redis（O(N) 阻塞），改 SCAN 或版本号前缀（`cache:v2:<ts>`）。
4. **定时任务挂载**：挂在 `prisma` 单例首次 import 时启动，冷启动无 DB 请求则不跑；建议显式 `instrumentation.ts` 注册，并将 cron 心跳、leader 切换纳入指标。
5. **多币种仅展示不结算**：`CURRENCY` 单值全局、Stripe 不支持 CNY——出海前需按币种建 Price/多支付网关（既有文档已列）。
6. **图片素材**：picsum/unsplash 占位与 `dangerouslyAllowSVG`（生产 CSP 已收窄 img-src，风险可控）——换站内素材 + CDN 域名收紧 remotePatterns。
7. **评论/晒单反垃圾**：无审核开关，恶意买家可刷低分或垃圾图（既有文档已列）。
8. **性能门禁**：无 Lighthouse CI / bundle 回归断言；建议 CI 加性能预算，防止后续回归。
9. **仓库卫生**：根目录散落 `s*.tmp.mjs`、`.screen-check.png`、`.preview-captures/`、`tsconfig.tsbuildinfo`（已 ignore）等临时产物；scripts/ 下大量一次性爬虫/QA 脚本建议移入 `scripts/archive/`。

---

## 四、商业运营功能差距（代码之外，决定"能不能做生意"）

| 域 | 现状 | 运营建议 |
| --- | --- | --- |
| 发票/税务 | PDF 发票仅信息展示；`TAX_RATE=0` 默认无税 | 国内合规需对接数电发票/税务信息；跨境需 VAT/关税能力 |
| 客服 | 无工单/聊天/退换货物流面单 | 上线前至少接一个客服渠道（邮件 + 工单），退款物流回传 |
| 营销 | 优惠券/到货通知齐备；无订阅营销、无埋点转化漏斗 | 接 GA4/友盟 + 事件埋点（下单/支付/加购漏斗） |
| 风控 | 无支付风控（拒付、异常订单、黄牛） | 小额阶段可手工复核 + 阈值告警；量起来再上风控服务 |
| 合规 | 政策页齐备，但无 ICP 备案位/未成年人条款/退款时效承诺 | 按目标市场补齐备案与本地化条款 |
| 内容运营 | 商品图外链/占位图、无富文本描述编辑 | 商品素材统一走后台 S3 + CDN，制定上传规范 |

---

## 五、建议路线图

**第 1 周（资金安全冻结）**：P0 #1 webhook 错误码与部分退款状态机 → P0 #2 退款原子认领 → P0 #3 券限额事务化 → 补对应集成测试（部分退款、webhook 重放、并发退款、券超发）。

**第 2 周（安全加固）**：P0 #4 可信代理与账号锁定 → P0 #5 密钥管理/启动流程改造 → P1 #1/#2 券码限流与 CSV 注入 → HSTS 兜底。

**第 3-4 周（可靠性）**：P1 #3 邮件重试 → #4 ISR 化静态页 → #5 Sentry 全覆盖 → #6 readiness 探针 → #8 异地备份 + 恢复演练。

**第 2-3 月（规模化）**：P2 全文检索、统计 SQL 化、缓存版本化、性能门禁、运营功能（税务/客服/埋点）。

---

## 六、项目做得好、值得保留的部分（防止"为了改而改"）

- 库存扣减：事务内 `SELECT FOR UPDATE` + 条件更新，防超卖与负库存；预售按实扣量记录、取消精确回补。
- 支付幂等：`PENDING_PAYMENT→PAID` 原子认领，重复回调/并发双击只有一次生效；PaymentLog 只追加。
- 认证：JWT httpOnly + Refresh 轮换 + 重放检测（吊销全会话）+ CSRF double-submit + CSP per-request nonce。
- 降级策略：Redis/DB/邮件/存储均有优雅降级，DB 故障时全站可浏览。
- 工程化：Prisma 迁移基线、三层测试、CI（lint/typecheck/test/build/e2e）、Docker 多阶段 + standalone、Nginx 配置。
- 合规雏形：GDPR Cookie 横幅、隐私/条款/退款政策、数据删除请求、审计日志。

> 判定：P0 五项全部关闭 + P1 第 1-6 项完成前，只适合内测/试营业；全部 P1 关闭后可小规模收费放量。

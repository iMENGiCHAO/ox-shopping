# Ox Shopping 全栈项目深度审计报告

> 审计日期：2026-09-23  
> 审计基线：`main` / `bab3e37` + 当前未提交工作区  
> 审计方式：当前代码静态审计 + 无数据库写入的构建/检查；未修改业务源码  
> 结论定位：**功能较完整的预上线项目，不具备直接生产放量条件**

## 1. 执行摘要

这不是一个普通练习项目。它已经具备完整电商骨架：商品、游客/登录购物车、多币种、结账、订单、支付、库存、物流、优惠券、退款、账户、通知、邮件、后台运营、审计和分销佣金，而且订单锁库存、支付金额校验、分销幂等、密钥加密、CSRF/CSP、RBAC 等实现有真实工程含量。

但“代码多、功能全、测试多”不等于“能安全收真钱”。当前最大的短板集中在生产边界和跨系统一致性：

1. **测试命令可能对误配的非测试库执行破坏性 `db push`。**
2. **后台配置的 Stripe 支付会丢失游客订单令牌，支付后即时闭环断裂。**
3. **退款存在并发旧余额与 DB/网关非原子问题，可能超退或“本地已退、网关未退”。**
4. **后台可手工把未支付订单改为 PAID，普通状态更新还有 TOCTOU 竞态。**
5. **生产 S3 可静默降级到容器本地盘，健康检查在 DB 故障时仍报 200。**
6. **邮件、站内信、支付/审计旁路缺乏 outbox，失败后会永久丢失。**
7. **COD、游客预售、优惠券多币种等业务存在已确认口径错误。**
8. **账户“删除”仅匿名化 User，订单地址/邮箱/订阅/审计仍保留可识别信息。**
9. **生产依赖存在 high 级漏洞，备份恢复与生产 CI 门禁也不足。**

### 综合评分：56 / 100

| 维度 | 分数 | 说明 |
|---|---:|---|
| 架构与类型 | 76 | Next/TS/Prisma 骨架清楚，分销隔离意识好；读侧 service 边界仍松散 |
| 安全基线 | 68 | JWT/CSRF/CSP/RBAC/加密都有；token 日志、上传、SSRF、刷新宽限仍有缺口 |
| 业务完整度 | 72 | 核心模块广；支付、退货、COD、隐私偏好尚未达到商用闭环 |
| 数据与资金正确性 | 52 | 订单库存主链不错，但退款、普通状态、库存后台写存在竞态 |
| 测试 | 66 | 单测数量与关键场景较多；测试入口本身有破坏性缺陷，无覆盖率门槛 |
| 性能与扩展 | 55 | 当前数据量可用；仪表盘、报表、搜索、导出存在全量扫描/内存化 |
| 部署与运维 | 52 | Docker/CI 基础齐全；生产迁移、readiness、preflight、备份恢复不完整 |
| 可观测性 | 44 | pino + 可选 Sentry；compose 未注入 DSN，缺可靠队列/业务指标/告警 |
| 文档一致性 | 48 | 文档很丰富，但“生产级/零缺陷/可商用”等口径与当前代码、外部条件不匹配 |

## 2. 当前系统地图

### 2.1 规模

- 约 68 个 `page.tsx`、130 个 API Route Handler、30 个 Prisma model、29 个 migration 目录。
- 路由组：`(shop)` 商城、`(checkout)` 结账、`(distribution)` 用户分销中心、`/admin` 运营后台、`/api` 后端接口。
- 业务服务集中在 `src/server/services`，基础设施在 `src/lib`，客户端交互在 `src/components`。
- 分销商城侧主要通过 `src/server/services/distribution/bridge.ts` 接入，模块隔离与失败隔离是当前架构亮点。

### 2.2 核心链路

```text
商品/分类 → 购物车（登录 DB / 游客 localStorage）
          → 地址/物流/优惠券/多币种试算
          → 订单事务（锁价、锁库存、锁券、生成快照）
          → 创建支付（mock / Stripe；其他渠道为预留）
          → 支付确认 / COD
          → 后台履约 → 退款/分销冲正
```

### 2.3 做得好的部分

- 商品与订单金额、汇率、地址、物流、规格均保存快照，历史订单不依赖当前商品配置。
- 下单对商品行 `FOR UPDATE`，普通库存使用条件 decrement；取消/退款按 `stockDeducted/specDeducted` 精确回补。
- 支付成功以 `PENDING_PAYMENT → PAID` 条件更新原子认领，重复回调不会重复推进订单。
- 优惠券事务内锁定，`(couponId, orderId)` 唯一，取消/退款回补。
- 分销用归属快照、佣金唯一键、CAS/行锁、分钟级 reconcile，财务一致性意识明显高于普通项目。
- 密钥落库采用 AES-256-GCM，API 脱敏；日志脱敏、CSV 注入、上传路径 containment、CSRF/CSP 都有实际实现。
- 后台不是空壳，商品、订单、退款、用户、支付、邮件、物流、审计、分销都有真实 UI/API。

## 3. 当前代码确认的上线阻断项

### P0-1：测试初始化可能破坏误配的非测试库

`tests/helpers/global-setup.ts:15-19,35-38` 对任意非空 `DATABASE_URL` 执行：

```text
prisma db push --skip-generate --accept-data-loss
```

直到 `:61` 才检查库名是否以 `_test` 结尾；这个检查只保护后面的清库。`vitest.config.ts:11` 又把 global setup 挂到 unit+integration，所以 `npm run test:unit` 也可能触发 DDL。

**修复**：任何 DDL 前 fail-closed 验证测试库；unit 默认不挂 DB setup；增加“生产/非测试 URL 立即退出”的回归测试。

### P0-2：渠道化 Stripe 丢失游客订单 token

- `src/lib/payment/provider.ts:22-34` 的 `CreatePaymentInput` 没有 `accessToken`。
- `src/server/services/order.service.ts:770-779` 调 provider 时未传 token。
- `src/lib/payment/providers/stripe.ts:53-65` 调 `createCheckoutSession` 也未传。
- legacy 路径 `order.service.ts:815-823` 却正确传了 token。

结果：后台启用 Stripe（主推真实收款）后，游客支付完成回到 result 页时没有 token，无法即时查看订单、发票或后续操作。

**修复**：统一所有 Stripe 创建路径，Provider 输入显式携带订单回跳凭据；补渠道化游客支付集成测试。

### P0-3：退款并发与跨网关一致性不成立

- `order.service.ts:1263-1271` 在事务外读取累计退款，再进入 `:1274-1294` 的订单锁事务，锁内未重算。
- 并发“部分退款审批 + 整单退款”可基于同一旧 remaining 重复发起网关退款。
- `src/app/api/admin/refunds/[id]/route.ts:89-145` 与 `order.service.ts:1273-1443` 都是先落本地退款状态，再调用网关。
- 网关成功但响应丢失时可重复退款；网关失败时可能已把订单标成 REFUNDED，且后续幂等入口直接返回，没有可重试状态。
- Stripe refund `src/lib/payment/stripe.ts:188-199` 未传 provider idempotency key。

**修复**：退款状态机 + outbox + provider idempotency key + webhook 对账；订单行锁后重算 remaining；后台提供可审计重试。

### P0-4：手工 PAID 与普通状态 TOCTOU

- SUPPORT 可把 `PENDING_PAYMENT` 改为 `PAID`，但 `updateOrderStatus` 只写 status/paidAt，不执行 `markOrderPaid` 的支付流水、确认邮件、通知和分销计佣。
- `order.service.ts:1105-1111` 在旧对象上验证状态，`:1160-1164` 无条件 update；并发状态可互相覆盖甚至让 REFUNDED 状态回退。

**修复**：普通状态流删除 PENDING_PAYMENT→PAID；PAID 只由支付确认或独立、受审计的线下核验入口产生；普通状态更新改成事务/CAS 条件认领。

### P0-5：生产存储与健康检查会“假就绪”

- `src/lib/env.ts:101-107,308-316`：声明 S3 但配置不全时静默变 local。
- `src/lib/storage/index.ts:124-140`：随后把上传写进容器磁盘，重建/多实例会丢图。
- `docker-compose.yml:99-106`：生产默认仍是 local，S3 可空，启动守卫不阻止。
- `src/app/api/healthz/route.ts:20-34` 与根 healthz 在 DB down 时仍 HTTP 200/status ok；Docker/Compose 只按 200 判健康。
- 上线自检 `launch-readiness.service.ts:157-172` 只看 `STORAGE_DRIVER=s3`，没有验证 S3 实际有效。

**修复**：生产 local 存储显式豁免且默认拒绝；S3 配置/读写探针 fail-fast；拆分 `/livez` 与 `/readyz`，readiness 失败返回 503。

### P0-6：生产依赖漏洞

只读审计执行 `npm audit --omit=dev --audit-level=high`，报告 2 个 high、1 个 moderate。直接依赖中的 `nodemailer 9.0.5` 与 `sharp 0.35.3` 命中安全通告；Docker/CI 还使用 `npm ci --no-audit --no-fund`。

**修复**：升级到修复版本，清理 lockfile；CI 增加 production audit 阻断并用固定镜像 digest/Action SHA。

### P0-7：隐私承诺与实际删除范围不一致

账户删除只匿名化 User.email/name/status；Order.contactEmail、addressSnapshot、NotifyMe.email、审计 meta、分销/提现快照仍可能保留原始身份。邮件文案却承诺历史订单不再识别用户。

**修复**：形成法定留存字段清单；非必要 PII 清洗，必要财务字段设明确留存期与访问控制；修正隐私文案并补数据主体删除/导出测试。

## 4. 重要 P1 问题

1. **支付初始化失败会形成死单**：`api/orders/route.ts:137-159` 吞掉 createPaymentUrl 错误并返回成功空 URL；库存/券已落库，用户没有付款入口。
2. **渠道 Stripe 通用回调 ID 语义错误**：`providers/stripe.ts:73-85` 把 session.id 当 transactionId，退款却要求 PaymentIntent ID；使用 `/api/pay/notify/stripe` 时后续退款会失败。
3. **COD 金额币种错误**：`order.service.ts:548-550` 直接存 USD 物流费，`:646-658` 与已换算 total 相加后按订单币种展示。
4. **COD 永远不进分销**：COD 直接 PROCESSING、不写 paidAt、不触发 onOrderPaid；reconcile 又筛选 paidAt 非空。
5. **后台库存绝对写覆盖并发扣减**：`admin/products/[id]/stock/route.ts:19-24` 与 product PUT 可覆盖下单原子 decrement，造成超卖。
6. **游客 token 进入 URL/日志/Sentry**：`order-api.ts:11-18` 放 query，`api.ts:72-92` 记录完整 req.url，Nginx access log 默认也会记录 query。
7. **刷新 token 60 秒宽限过宽**：`session.ts:201,227-270` 在窗口内直接签发新会话且无设备绑定，真实重放与并发请求不可区分。
8. **Webhook 无 event.id 持久去重**：订单状态幂等不等于事件幂等；退款乱序/重投仍可能产生错误副作用。
9. **邮件/站内信无 outbox**：`sendMail` 吞异常且仍记录“已发送”；大量 `void` 通知无重试/死信，进程退出即永久丢。
10. **优惠券核销金额币种错**：`coupon.service.ts:250-257` 存 USD，`:368-405` 却按 order.currency 展示。
11. **游客预售购物闭环断裂**：`cart/preview` 不返回 isPresale，游客 CartLine 丢失该字段，购物车以 stock<=0 一刀切阻止结账。
12. **SUPPORT 消息中心死入口**：通知发给 ADMIN+SUPPORT，导航也可见，但 API 全 requireAdmin，SUPPORT 永远 403。
13. **S3 预签名不限制真实大小**：只签 ContentType，不签 Content-Length；10MB 限制可被绕过。
14. **Logo URL 服务端抓取存在 SSRF 面**：管理员可提交任意 HTTPS URL，服务端 fetch 后仅做明暗判断。
15. **preflight 与运行时守卫不一致**：只做 TCP 探测，不查真实 SQL、migration status；漏掉多个运行时必填项。
16. **备份恢复不可交付**：当前本机脚本无异地、加密、定期恢复演练，恢复提示的 gzip 用法也需修正。
17. **健康/支付守卫不识别渠道化 Stripe 的完整现实**：env 启动守卫与后台 DB 渠道配置是两套状态源，容易误阻断或靠关闭 mock 守卫绕开。
18. **政策承诺与退货能力不一致**：政策写“7 天无理由退换”，系统没有 Return/Exchange/Shipment 状态机。

## 5. P2 工程债务

- 约 170 处 page/route 直接访问 Prisma，service 边界只覆盖部分写业务，读模型/统计容易漂移。
- 仪表盘 `stats.service.ts:56-139` 每次加载所有已支付订单到 Node 内存；分销客户报表也有大范围历史读取。
- 商品搜索 `%ILIKE%` 无 trigram/GIN；RefreshToken 清理字段无对应索引。
- Redis 商品缓存失效使用 `KEYS products:v2:*`，大库会阻塞 Redis。
- 生产 Redis 故障时限流退化到每进程内存，多实例安全口径分裂。
- Prisma 单例生产不挂 globalThis，与项目对 Next 多 bundle 的假设不一致。
- 调度器把最长 5 分钟任务和 Stripe 网络 I/O 放在 advisory-lock 事务中；应改 lease/短事务 claim。
- build 阶段已经观察到 3 个页面 worker 各自启动 cron，说明 import Prisma 即启动调度器的副作用边界过宽。
- 地址默认没有 DB 级“每用户一个默认”约束。
- 订单/用户导出一次性内存化，数据增长后有 OOM/超时风险。
- 用户数据导出缺退款、通知、密码申请、分销等域。
- 订单号 6 位随机且无 P2002 重试。
- README 环境表仍写默认 CNY，代码/.env 是 USD；“可商用/完整跑通/零缺陷”与支付/退货/IP 事实不匹配。
- `package.json` 允许 Node >=18.17，但 Next 16.3.3 实际要求 Node >=20.9；CI/Docker 用 Node 20 掩盖了声明错误。
- 根目录缺 LICENSE/NOTICE，若 shop.x.com 风格或商品素材并非自有，商业授权链是外部阻断。

## 6. 验证结果与证据边界

### 本轮实际通过

| 检查 | 结果 |
|---|---|
| `npm run typecheck` | 通过，0 error |
| `npm run lint` | 通过，0 error / 14 warning |
| `npm run build` | 通过；Next 16.3.3 standalone 产物生成成功 |
| Prisma validate（只读子审计） | 通过 |
| Unit tests（`SKIP_DB_PUSH=true`，只读子审计） | 22 files / 248 tests 通过 |

### 本轮明确未运行

- 未运行 integration/E2E：当前 global setup 在库名校验前可能执行 destructive db push，不能为拿“绿灯”冒生产数据风险。
- 未运行 seed、migrate deploy、真实支付、邮件、S3 写入。
- 历史文档/CHANGELOG 的“全绿”只作为背景，不视为当前代码的发布证明。

### 发现的 build 警告

当前 `.env` 下 production build 能完成，但会输出弱 JWT/支付加密密钥、缺 SITE_NAME、支付为 mock 等生产守卫警告；同时页面数据收集阶段启动了 3 次 cron。构建成功不等于生产配置合格。

## 7. 推荐整改路线图

### 第一批：0–48 小时，止血

1. 修 global setup：unit 不挂 DB；所有 DDL 前校验 `_test`；误指生产立即失败。
2. 修渠道 Stripe 游客 token；补真实集成测试。
3. 删除后台通用 PENDING_PAYMENT→PAID；普通状态更新改 CAS/事务。
4. 修退款 remaining 锁内重算；暂停无幂等 key 的重复退款入口，增加 pending/failed/retry 状态。
5. 日志与 Sentry 对 token/csrf 等 query 脱敏；API 改 header 传 token。
6. 生产 S3 fail-fast；拆 live/readiness；Node engines 改 >=20.9。
7. 升级 nodemailer/sharp，CI 增加 production audit。

### 第二批：第 1–2 周，资金与可靠性闭环

1. 建 Payment/Refund/Notification/Email Outbox；worker 重试、DLQ、幂等键。
2. Webhook 建 provider+eventId 去重；退款按 refund object/amount 增量处理。
3. 支付初始化失败返回可恢复状态与订单入口，不吞成成功空 URL。
4. 修 COD 金额换算与分销确认点；明确“货到付款何时算佣金”。
5. 修库存后台 CAS；地址默认部分唯一索引。
6. 修游客预售 DTO；统一可购谓词。
7. 修 CouponRedemption 币种口径并迁移历史数据。
8. 修 SUPPORT 消息权限；修隐私删除/导出范围与文案。

### 第三批：第 3–4 周，生产工程化

1. CI 增加：空库 migrate deploy、migration/schema drift、standalone Docker build/start smoke、preflight、audit。
2. 备份迁移到托管 PITR/异地对象存储；加密；定期自动恢复演练。
3. 仪表盘/报表改 DB aggregate、日汇总与 cursor 分页；补搜索/清理索引。
4. Redis 缓存改版本号/SCAN；关键多实例限流不要静默退化为每进程桶。
5. 加 cron last-success、退款失败、邮件失败、队列积压、支付 webhook mismatch 指标与告警。
6. 写唯一“当前能力矩阵”，README 不再复制过时数字/默认环境口径。

### 上线验收门槛

- P0 全部关闭并有回归测试。
- 空库 migration → standalone Docker → readiness 全链路 CI 通过。
- 真实 Stripe 支付、取消、部分退款、重复 webhook、响应超时、全额退款在测试环境跑通。
- 真实 SMTP/Resend + S3 做配置保存、故障、重试、恢复演练。
- 备份能在空环境恢复并校验订单/退款/分销账。
- 明确目标市场与真实收款渠道：若面向中国大陆，Stripe 不支持 CNY，支付宝/微信仍是 stub，必须实际对接。
- 完成素材/IP、隐私、分销、税务/KYC 法务确认。

## 8. 最终判断

大爷，这个项目的**业务骨架和工程质量明显高于普通 AI 生成电商项目**；最值钱的是订单库存主链、快照设计、分销隔离和持续修 bug 的意识。

但当前仍应把它定义为：

> **“功能较完整的高质量预上线项目”**，而不是“可以直接上线收真钱的商业系统”。

先完成第一批止血，再做 outbox/退款状态机和生产 CI。通过这些门禁后，项目可提升到约 75–80/100，才适合真实流量放量。

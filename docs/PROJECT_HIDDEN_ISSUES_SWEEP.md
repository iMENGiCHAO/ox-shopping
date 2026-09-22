# 隐藏问题扫雷报告（投产前）

> 审查对象：`/Volumes/Time Machine/DeepSeek/ecommerce`（Next.js 16 App Router + TypeScript + Prisma/PostgreSQL 16 + Redis + Stripe + Resend/SMTP + 本地/S3 存储）
> 审查性质：**只读代码审查**（未修改任何源码 / 配置 / 迁移），所有结论均给出 `file:line` 证据。
> 审查时间：2026-09-21（相对 `git` 工作区当前状态，含未提交改动）
> 审查方法：逐文件读取核心资金/状态机链路（`order.service.ts` / `coupon.service.ts` / 退款路由 / webhook / 调度器）+ 全量 route 守卫普查 + schema↔migrations 逐表逐列逐索引比对 + 部署编排与环境变量交叉核对。
>
> **不在本报告范围内的既有发现**（按要求不重复）：COD 跳过支付、生产 mock 支付守卫、IP 限流塌缩、多币种金额恒等式、Redis 密码、客服留言收件箱、管理端订单编辑。
> 但「与这些点相关的新隐患」仍会单列，并明确标注为**新发现**。

---

## 摘要

| 严重度 | 数量 | 说明 |
| --- | --- | --- |
| **P0（阻断投产）** | **4** | 资金算错 / 钱收了不退 / 重复退款 / 生产容器起不来 |
| **P1（高）** | **10** | 越权退款、交易邮件全丢、生产守卫被默认值架空、状态机并发回归、库存被覆盖、仪表盘 OOM、凭据进日志等 |
| **P2（中）** | **12** | 币种/账目口径、缓存与索引、监控与健康检查、测试用 db push 掩盖迁移 |
| **P3（建议）** | **9** | 边界收紧与工程化完善 |

**一句话结论**：业务链路的「主路径」质量相当高（幂等认领、行锁、金额恒等式、守卫覆盖都做得比一般项目扎实），**真正会炸的是三类边缘**：(1) 零小数币种与网关金额单位；(2) 订单过期/部分退款与后台状态机之间的交叉；(3) Docker 生产编排与环境变量 fail-fast 之间的**不一致**（守卫写了，但 compose 不传变量，导致「本地能起、生产必崩」）。

---

## P0 · 阻断投产

### P0-1　JPY 等零小数币种用 Stripe 收款会**多收 100 倍**，且金额校验抓不到

- **严重度**：P0（真实多扣客户资金 → 拒付/退款/品牌事故）
- **现象（上线后会怎样）**：顾客在币种选择器里选 **JPY**（`CURRENCIES` 里明确提供），下单走 Stripe。商品 $100 → 页面显示 ¥15,912（汇率快照 159.1254），但 Stripe 收到的 `unit_amount` 是 `round(15912.54 × 100) = 1591254`，而 **JPY 是 Stripe 的零小数币种**，`unit_amount` 的单位就是「日元」→ 实际扣款 **¥1,591,254**（≈ $10,000）。webhook 的金额一致性校验用的是同一套 ×100 口径（`Math.round(total*100)` vs `session.amount_total`），两边都错得一致，**校验通过、无告警、订单照常标记已付**。退款也用同一口径，等于把 100 倍一起退，客户先被扣爆卡。
- **代码位置**：
  - 币种白名单含 JPY：`src/components/shop/currency.ts:37`（JPY，另见 86 行内置汇率）
  - 单位换算无零小数币种分支：`src/lib/utils.ts:41-43`（`toCents = Math.round(Number(amount) * 100)`）
  - Stripe Checkout 直接用 `toCents`：`src/lib/payment/stripe.ts:92`（`unit_amount: toCents(item.price)`）
  - 只拦了 CNY，未拦其它零小数币种：`src/lib/payment/stripe.ts:81-85`
  - 网关金额校验用同一错误口径：`src/app/api/webhooks/stripe/route.ts:61-62`；对账同样：`src/server/jobs/scheduler.ts:169-170`
  - 退款同样 ×100：`src/lib/payment/stripe.ts:176`
- **修复建议**：
  1. 在 `src/lib/utils.ts` 增加 `toMinorUnits(amount, currency)`，按 Stripe 零小数币种表（JPY/KRW/VND/CLP 等 `*100` → `*1`）分支；`src/lib/payment/stripe.ts:92`、`:176`、阿里/微信 provider（`Math.round(input.total*100)`，`src/lib/payment/providers/wechat.ts`）全部改走它。
  2. webhook `:61` 与对账 `scheduler.ts:169` 的 `expectedCents` 改用同一函数，避免「口径一致地错」。
  3. 若短期不修：在 `src/components/shop/currency.ts:18` 的 `CURRENCIES` 中临时移除零小数币种，或在 `createCheckoutSession` 里显式拒绝（与 CNY 同款守卫）。
  4. 加一条单测：JPY 订单 → `createCheckoutSession` 的 `unit_amount === 订单 JPY 金额`（现有 `tests/unit/currency.test.ts` 未覆盖网关单位）。

### P0-2　订单 30 分钟被自动取消后顾客仍可付款 → **钱收了、单取消了、货回补了、无人告警**

- **严重度**：P0（真金白银收进来却不发货、可能超卖，且完全静默）
- **现象**：`ORDER_EXPIRE_SECONDS` 默认 1800s，`expireStaleOrders()` **只按 `status='PENDING_PAYMENT' AND createdAt < deadline` 取消订单，完全不检查 Stripe Checkout Session 是否仍然 open**；而 `createCheckoutSession()` 没有设置 `expires_at`，Stripe 默认会话有效期 **24 小时**。于是第 30–1440 分钟之间存在一个巨大的危险窗口：顾客点开旧邮件/浏览器标签继续付款 → Stripe 收钱 → `checkout.session.completed` 到达 → `markOrderPaid()` 发现状态不是 `PENDING_PAYMENT`，**直接 `return order`（无日志、无告警、不退款）** → webhook 仍返回 200（Stripe 不重试）→ 对账任务只扫 `status='PENDING_PAYMENT'`，也永远不会发现这个订单。结果：钱进了 Stripe 账户，订单是 CANCELLED，库存已回补（可能已被别人买走 → 超卖），顾客拿不到货也拿不到退款。
- **代码位置**：
  - 无条件按时间取消：`src/server/services/order.service.ts:1070-1086`（`findMany where {status:'PENDING_PAYMENT', createdAt:{lt:deadline}}` → `cancelOrder`）
  - 会话未设过期时间：`src/lib/payment/stripe.ts:87-109`（`checkout.sessions.create` 无 `expires_at`）
  - 静默丢弃付款：`src/server/services/order.service.ts:866`（`if (order.status !== "PENDING_PAYMENT") return order;`）
  - webhook 吞掉结果并回 200：`src/app/api/webhooks/stripe/route.ts:95`、`:149`
  - 对账只扫 PENDING_PAYMENT：`src/server/jobs/scheduler.ts:136-141`
- **修复建议**：
  1. `src/lib/payment/stripe.ts:87` 创建会话时设 `expires_at = now + ORDER_EXPIRE_SECONDS`（Stripe 最小 30 分钟，取 `max(ORDER_EXPIRE_SECONDS, 1800)`），让网关侧过期与本地超时**同源**。
  2. `expireStaleOrders()` 在取消前对 `paymentSessionId` 非空的订单先 `retrieveCheckoutSession`，仅当 `status === 'expired'` 才取消（该逻辑 `scheduler.ts:202-207` 已有，挪进/复用到 `expireStaleOrders`）。
  3. `markOrderPaid()` 在 `status ∈ {CANCELLED, REFUNDED}` 时**不能静默 return**：记 `PaymentLog(event:'paid_after_cancel')` + 自动发起 `createStripeRefund` + `notifyAdmins` 强告警；`webhook` 对应分支返回 200 但确保留下可检索痕迹。
  4. 补集成测试：建单 → 直接改 `createdAt` 到过期 → 过期任务取消 → 再投递 `checkout.session.completed`，断言「发生退款或至少产生告警流水」。（`tests/integration/cron-jobs.test.ts:107` 只测了「该取消」，没测「取消后又付款」）。

### P0-3　部分退款完成后再由后台「改为已退款」→ **按订单总额二次全额退款（超退）**

- **严重度**：P0（重复出账给客户，几乎无法追回）
- **现象**：顾客申请退 $30（订单 $100），管理员在「退款审核」通过 → 网关退 $30，本地退款单 `REFUNDED`，订单仍是 PAID（部分退款不改整单状态，设计正确）。此后管理员（或客服）在订单详情把状态改成 **REFUNDED**，走的是 `updateOrderStatus(..., to='REFUNDED')` → `refundEntireOrder(order, actorId)`，**没有 `skipGatewayRefund`**，于是执行 `createStripeRefund(order.paymentId, Number(order.total))` = 再退 **$100**。合计退 $130 > $100。更糟的是 `refundEntireOrder` 里「已存在退款单就不新建」的分支（`:1357-1363`）会把这张已有部分退款单直接当成整单退款单，**账面上只记录了一笔 $30**，多退的 $100 在本地退款表里查不到，只能对 Stripe 流水才能发现。
- **代码位置**：
  - 部分退款审核（正确路径）：`src/app/api/admin/refunds/[id]/route.ts:85-146`（按 `refund.amount` 退网关）、`:171-181`（累计达全额时带 `skipGatewayRefund` 调状态机）
  - 后台单笔改状态（错误路径）：`src/app/api/admin/orders/[id]/status/route.ts:36`（`updateOrderStatus(order, input.status, ...)`，无 `skipGatewayRefund`）
  - 全额退网关的落点：`src/server/services/order.service.ts:1396-1404`（`createStripeRefund(order.paymentId, Number(order.total))`）
  - 复用旧退款单导致账实不符：`src/server/services/order.service.ts:1340-1363`
  - 批量路径同样受影响：`src/app/api/admin/orders/batch-status/route.ts:28`（REFUNDED 需 ADMIN，但仍是全额退）
  - UI 入口：`src/app/admin/orders/page.tsx:46`、`:257`（状态下拉里含 REFUNDED）
- **修复建议**：
  1. `src/server/services/order.service.ts:1404` 改为「**剩余可退额** = `order.total − Σ(已 REFUNDED 退款单金额)`」，为 0 时直接跳过网关退款只做本地状态推进与库存回补；`refundEntireOrder` 里为差额**新建**一条退款单，而不是复用部分退款单（改 `:1340-1363` 的同额合并逻辑）。
  2. 或在 `updateOrderStatus` 收到 `to='REFUNDED'` 时，先聚合已退金额，若 `> 0` 则**禁止**直达整单退款，强制走退款审核流程（返回明确文案）。
  3. 加集成测试：部分退款 $30 → 后台改 REFUNDED → 断言 Stripe 只被调用一次差额（$70）且退款表累计 = $100。
  4. 顺带修「网关退款失败后无法重试」：`refundEntireOrder` 先把订单置 REFUNDED 再退网关，一旦网关超时/失败（`:1413-1421`）订单已是终态，接口层无法重试，只剩人工去 Stripe 后台操作。建议增加「退款待重试」状态或允许对 `gatewayRefundId IS NULL` 的 REFUNDED 订单重发（见 P1-7）。

### P0-4　生产 `docker compose` 起来的 app 容器**必定启动失败**（环境变量既没传、又没校验）

- **严重度**：P0（部署阻断；且 `preflight` 会给 PASS，最容易在交付当天翻车）
- **现象**：`docker-compose.yml` 的 `app.environment` **没有声明** `PAYMENT_CHANNEL_ENC_KEY`，也没有 `env_file: .env`（compose 只把显式列出的变量注入容器）。容器内该变量为空 → `env.ts` 取默认值 `dev-payment-channel-enc-key-change-me` → 命中「弱密钥」守卫（`isWeakSecret` 命中 `^dev-`）→ `REQUIRE_STRONG_SECRETS` 在容器里因 `NODE_ENV=production` 默认 `true` → **`throw` 拒绝启动**。同理 `SITE_NAME` 也完全没传 → 占位品牌守卫同样 `throw`。表现：容器起来 → 跑完 `prisma migrate deploy` → `node server.js` 抛错退出 → `restart: unless-stopped` → **崩溃重启循环**，反代 502。而 `scripts/preflight-check.ts` 的 `REQUIRED_PROD` 只校验 4 个变量、**不检查 `PAYMENT_CHANNEL_ENC_KEY` / `SITE_NAME`**，所以「上线前自检」会给出 PASS，与运行时守卫结论相反。
- **代码位置**：
  - 缺 `PAYMENT_CHANNEL_ENC_KEY`：`docker-compose.yml:73-117`（整段 `environment` 内无此键；`grep -c PAYMENT_CHANNEL_ENC_KEY docker-compose.yml` = 0）
  - 缺 `SITE_NAME`：同样是 0 处
  - 无 `env_file`：`docker-compose.yml` 全文无 `env_file`
  - 弱密钥守卫：`src/lib/env.ts:155-181`（`:161` 把 `PAYMENT_CHANNEL_ENC_KEY` 计入 weak）
  - 占位品牌守卫：`src/lib/env.ts:186-208`
  - 默认值来源：`src/lib/env.ts:60`、`:90`
  - preflight 漏项：`scripts/preflight-check.ts:67-72`（`REQUIRED_PROD` 仅 4 项），全文件无 `PAYMENT_CHANNEL_ENC_KEY`
  - 启动链路：`Dockerfile:44-48`（ENTRYPOINT → `migrate deploy` → `node server.js`）
- **修复建议**：
  1. `docker-compose.yml` 的 `app` 增加 `env_file: [.env]`，或把 `PAYMENT_CHANNEL_ENC_KEY: ${PAYMENT_CHANNEL_ENC_KEY:?...}`、`SITE_NAME: ${SITE_NAME:?...}`、`ALLOW_MOCK_PAYMENT_IN_PROD`、`ALLOW_PASSWORDLESS_REDIS_IN_PROD`、`SENTRY_DSN`、`SUPPORT_EMAIL/PHONE`、`COOKIE_DOMAIN` 显式列出（与 `.env.example` 对齐）。
  2. `scripts/preflight-check.ts` 的 `REQUIRED_PROD` 补齐同一份清单，并直接 `import` `env.ts` 的守卫结论，避免「两套校验各说各话」。
  3. CI 增加一步 `docker compose -f docker-compose.yml config` + 用假密钥 `docker compose up --build` 冒烟（至少断言容器不因 env 守卫退出）。
  4. `.env.example` 里 `REQUIRE_STRONG_SECRETS=`（空值）也建议显式写 `true`，避免被 `booleanFromString` 的空串分支静默转成 `false`。

---

## P1 · 高

### P1-1　SUPPORT 角色可在**单笔订单**接口触发全额退款（批量接口才是 ADMIN）

- **严重度**：P1（越权出账；代码自己在另一处明确「退款必须 ADMIN」，说明是漏改而非设计）
- **现象**：`/api/admin/orders/batch-status` 对 `REFUNDED` 显式 `requireAdmin()`，注释写着「REFUNDED 是真金白银出账，仅 ADMIN」；但 `/api/admin/orders/[id]/status` 一律 `requireStaff()`（= ADMIN + SUPPORT），同样能落到 `refundEntireOrder` → 网关全额退款。SUPPORT（客服）账号因此拥有任意退款权限，且每条退款只留下 `ORDER_REFUND_BY_ADMIN` 审计（其中 `actorId` 是客服），无审批链。
- **代码位置**：
  - 单笔：`src/app/api/admin/orders/[id]/status/route.ts:20`（`requireStaff`）、`:36`（`updateOrderStatus`）
  - 批量对照：`src/app/api/admin/orders/batch-status/route.ts:28`
  - 角色定义：`src/lib/auth/session.ts:142-153`（`requireStaff` = ADMIN|SUPPORT；`requireAdmin` = ADMIN）
  - 退款审核对照：`src/app/api/admin/refunds/[id]/route.ts:65`（`requireAdmin`）
- **修复建议**：`admin/orders/[id]/status/route.ts:20` 改为 `input.status === "REFUNDED" ? await requireAdmin() : await requireStaff()`，与批量接口同口径；或在 `updateOrderStatus` 内对 `to==='REFUNDED'` 增加一次 role 断言（纵深防御，防止未来新入口再漏）。

### P1-2　生产邮件**全部静默丢弃**（compose 默认 `MAIL_PROVIDER=console`，运行时无守卫）

- **严重度**：P1（订单确认/发货/退款/找回密码邮件全部不到，客诉与合规风险；且只在 `preflight` 里算 FAIL，运行时没人拦）
- **现象**：`docker-compose.yml:83` 默认 `MAIL_PROVIDER: ${MAIL_PROVIDER:-console}`。运营若没填 `.env`，容器内 `MAIL_PROVIDER=console` → `sendMail()` 走 `sendViaConsole`：只写日志 + 在容器可写层落 `.mail-out/*.html`（无卷、无轮转、无上限）。`env.ts` 的启动守卫**只检查 `SITE_NAME` / `MAIL_FROM`，不检查 `MAIL_PROVIDER`**，而 `scripts/preflight-check.ts:158-163` 才把 console 判为 FAIL —— 一个「上线前跑一下」的手工脚本，不进容器启动链路。结果：注册验证、找回密码、订单确认、发货、退款通知全部只落容器磁盘，顾客一封都收不到；同时容器磁盘被 HTML 文件慢慢撑爆。
- **代码位置**：
  - compose 默认值：`docker-compose.yml:83`
  - 降级落盘无上限：`src/lib/mail/index.ts`（`sendViaConsole`：`mkdir` + `writeFile`，`MAIL_OUT_DIR` 默认 `.mail-out`）
  - `env.ts` 未守卫 MAIL_PROVIDER：`src/lib/env.ts:70-77`（只声明不校验）、`:183-209`（守卫项只有 SITE_NAME / MAIL_FROM）
  - preflight 才判 FAIL：`scripts/preflight-check.ts:158-163`
  - Dockerfile 未挂 `.mail-out` 卷：`Dockerfile:26-41`；`docker-compose.yml` volumes 只有 pgdata/redisdata（`:122-124`）
- **修复建议**：在 `src/lib/env.ts` 增加与 mock 支付同款的守卫：`REQUIRE_STRONG_SECRETS && MAIL_PROVIDER === 'console' && !ALLOW_CONSOLE_MAIL_IN_PROD → throw`；`ALLOW_CONSOLE_MAIL_IN_PROD` 默认 false，并加入 compose 显式变量与 `.env.example`。

### P1-3　compose 把 `MAIL_FROM` 预设成 `example.com`，**架空了 env.ts 的发件域守卫**

- **严重度**：P1（发信被所有主流收件方拒收；守卫「看起来存在」但永远不触发）
- **现象**：`docker-compose.yml:84`：`MAIL_FROM: ${MAIL_FROM:-"Ox Shopping <no-reply@example.com>"}`。`env.ts:192-197` 的守卫判据是 `!env.MAIL_FROM.trim()` —— 在 compose 路径下这个值**永远非空**（哪怕是 IANA 保留域 example.com），所以「生产未配置发件地址 → 拒绝启动」的 fail-fast **永远不会生效**。同时 `src/lib/env.ts:319-332` 的 `mailFrom` 兜底逻辑（用站点域名拼 `no-reply@<域名>`，比 example.com 可投递得多）也被这个 compose 默认值短路。
- **代码位置**：`docker-compose.yml:84`、`docker-compose.local.yml:76`、`src/lib/env.ts:192-197`、`src/lib/env.ts:319-332`
- **修复建议**：compose 默认值改为空串（`MAIL_FROM: ${MAIL_FROM:-}`），让守卫按设计生效；或在 `env.ts` 的守卫里增加「域名命中 `example.com` / `example.org` 等保留域」判据（`src/lib/env.ts:153-154` 的 `isWeakSecret` 旁边加一个 `isReservedMailDomain`）。

### P1-4　管理端改库存是**绝对值覆盖**：并发下单的扣减会被静默回滚 → 超卖

- **严重度**：P1（库存账实不符直接导致超卖；大促时几乎必然发生）
- **现象**：`PATCH /api/admin/products/[id]/stock` 接收**绝对值** `stock` 并直接 `data: { stock: input.stock }`。后台 UI 是在打开编辑框时把列表里读到的 `product.stock` 填进去（`src/app/admin/products/page.tsx:219`），保存时把该值原样回写（`:229-231`）。若这期间有订单扣了库存（`order.service.ts:498-507` 走 SQL 原子 `decrement`），管理员的这次保存会把扣减**覆盖回去**（例如列表显示 100 → 实际已卖 5 变 95 → 管理员保存 100 → 库存凭空 +5）。同理 `PUT /api/admin/products/[id]`（`src/app/api/admin/products/[id]/route.ts:60-68`）也会写 `stock`。商品列表缓存（`CACHE_TTL` 默认 60s）还会让后台读到更旧的值，扩大窗口。
- **代码位置**：
  - 绝对值写入：`src/app/api/admin/products/[id]/stock/route.ts:19-24`
  - UI 填旧值：`src/app/admin/products/page.tsx:219`、`:229-231`
  - 同样写 stock 的 PUT：`src/app/api/admin/products/[id]/route.ts:60-68`
  - schema 只允许绝对值：`src/lib/validations/product.ts:132-134`
  - 下单侧原子扣减：`src/server/services/order.service.ts:498-507`
- **修复建议**：
  1. 把接口语义改为**增量**（`delta`）或引入版本号（`updatedAt`/`stockVersion`）做乐观锁：`updateMany({ where: { id, updatedAt: 客户端读到的值 }, ... })`，`count===0` 时返回冲突提示。
  2. 若必须保留绝对值语义，至少在事务里 `SELECT ... FOR UPDATE` 后把「期间发生的订单扣减量」加回（记录 `soldCount` 差值），并在 UI 保存前重新拉取。
  3. 给 `notifyRestock` 的 `0→有货` 判定也加同一事务（现在 `before` 是事务外读的旧值，`:19`）。

### P1-5　管理端仪表盘 `getAdminStats()` **全表加载历史订单**，订单量一大就慢查询/内存尖峰

- **严重度**：P1（后台首页每次打开/轮询都触发；几十万单后从毫秒变秒级，OOM 风险）
- **现象**：`getAdminStats()` 用 `prisma.order.findMany({ where: { paidAt: { not: null }, status: { notIn: [...] } } })` **不带时间范围、不带 take** 地把**全部历史已支付订单**拉进内存，再在 JS 里 `reduce` 算总营收与「今日营收」。订单表随业务线性增长，仪表盘耗时与内存也随之线性增长；而它统计的绝大多数是历史数据（总营收可以预聚合/物化）。
- **代码位置**：`src/server/services/stats.service.ts:48-51`（`findMany` 无 take/无日期下界）、`:53-60`（JS reduce）、`:124-133`（另外两次列表查询）
- **修复建议**：
  1. 总营收/今日营收改用 `prisma.order.aggregate` + `groupBy(currency)` 在 DB 侧算（多币种按 `exchangeRate` 快照折算需要在 SQL 里做表达式，或维护一张日汇总表，分销模块已有 `DistributionDailyStat` 的同款先例）。
  2. 趋势图按 `paidAt` 加时间下界（例如只取最近 30/90 天）。
  3. 给该接口加 `take` 兜底与 Redis 短 TTL 缓存（后台多标签页会重复打）。

### P1-6　游客订单查询令牌走 **query string**，被逐条写进应用日志

- **严重度**：P1（任何能读日志的人都能免登录查看/取消/退款他人游客订单）
- **现象**：游客订单的所有子接口调用都用 `?token=<43 字符 accessToken>` 拼 URL（`src/lib/order-api.ts:11-18`；`src/components/shop/mock-pay-panel.tsx:32`）。而 `apiHandler` 对**每个成功请求**都记 `logger.info({ url: req.url })` —— 完整 URL 连同令牌进日志（生产 JSON 输出到 Loki/CloudWatch）；`captureException` 也把 `url` 带给 Sentry。此外该令牌还会留在浏览器历史、被复制粘贴分享。`serializeOrder` 已经把 `accessToken` 从响应体剥离（做得对），但日志这条旁路把同一凭据泄了出去。
- **代码位置**：
  - 令牌进 URL：`src/lib/order-api.ts:16-17`、`src/components/shop/mock-pay-panel.tsx:30-32`、`src/app/(shop)/orders/[orderNumber]/page.tsx:179`
  - 日志记录完整 URL：`src/lib/api.ts:71-79`（`url: req.url`）
  - Sentry 同样带 URL：`src/lib/api.ts:89-91`
  - 服务端已支持 header 传令牌：`src/server/services/order-access.ts:31-35`（`x-order-token`）
- **修复建议**：
  1. 客户端改用 `x-order-token` 请求头（服务端已支持，零改动）；仅把令牌留在**页面 URL**（这是必要的，邮件链接要能直接打开）。
  2. `src/lib/api.ts:74` 日志脱敏：记录 `pathname` 而非 `url`，或统一对 `token`/`access_token`/`csrf` 等 query key 做打码。
  3. 顺手给 `logApiFailure`/`captureException` 的 context 做同样处理。

### P1-7　「订单已标退款但网关退款失败」的告警出口太弱（只有站内消息），且无法重试

- **严重度**：P1（最典型的「已退款但没退钱」；现有兜底靠人肉盯后台角标）
- **现象**：`refundEntireOrder` 先把订单事务性置为 `REFUNDED`（`:1262-1366`），**事务提交后**才调网关退款（`:1396-1421`）。网关失败时只做三件事：`logger.error` + 给管理员发一条站内消息（`notifyAdmins`，且是 `void` 不 await）+ 返回。此时订单已是终态，接口层无法重试（`updateOrderStatus` 再点 REFUNDED 会因 `:1254-1256` 幂等提前 return），只能人工登录 Stripe 后台。若 `SENTRY_DSN` 未配置（见 P2-9）或通知写库失败，这条「钱没退」的记录就只剩一行日志。`Refund.gatewayRefundId` 为 null 是唯一的可检索信号。
- **代码位置**：`src/server/services/order.service.ts:1262-1366`（先置状态）、`:1379-1393`（failRefund 仅日志+站内消息）、`:1396-1421`（网关调用与失败处理）、`:1254-1256`（幂等提前返回导致无法重试）
- **修复建议**：
  1. 增加可重试路径：允许对 `status='REFUNDED' AND Refund.gatewayRefundId IS NULL` 的订单重新发起网关退款（后台按钮 + 独立接口），并在 `PaymentLog` 记 `refund_retry`。
  2. 把「退款失败」提升为**必有出口**的告警：接 Sentry（`captureMessage(..., 'error')` 已在用，但需要 DSN）或直接发运营邮件（`sendMail` 到 `supportEmailFallback`），不能只依赖站内消息角标。
  3. 考虑「先退网关、成功后再落终态」的两阶段（需引入 `REFUND_PENDING` 中间态），或至少在 `Refund` 上加 `failedAt/failReason` 字段便于检索与重试。

### P1-8　`prisma db push` 会**静默删除**「同一用户仅一笔在途提现」的部分唯一索引

- **严重度**：P1（并发提现防线的唯一 DB 级保证消失；而项目的测试流程就在跑 db push）
- **现象**：`withdraw_records_one_inflight_per_user` 是一条 **partial unique index**，Prisma schema 无法表达，因此只存在于迁移 SQL 里（迁移注释自己也承认这点）。而 `prisma db push` 的语义是「让数据库结构与 schema 一致」——schema 里没有这条索引，`db push` 就会**把它删掉**（`tests/helpers/global-setup.ts:22` 正是 `prisma db push --skip-generate --accept-data-loss`，`package.json` 还暴露了 `db:push` 脚本，CI 的 E2E 也在用）。同理，下一次 `prisma migrate dev` 生成迁移时，diff 的 `from`（含该索引的 shadow DB）与 `to`（schema，不含）之间会产生一条 `DROP INDEX`，被 `migrate deploy` 带到生产。应用层的前置 `count` 检查与扣款不在同一事务（迁移注释也承认），所以少了这条索引就真的会出现「两笔在途提现、冻结翻倍」。
- **代码位置**：
  - 索引只在迁移里：`prisma/migrations/20260921120000_withdraw_one_inflight_per_user/migration.sql:20-22`（及文件头注释「Prisma schema 无法表达部分唯一索引…不会把它判为 drift」）
  - schema 无对应声明：`prisma/schema.prisma:978-1011`（`WithdrawRecord` 只有两条普通索引）
  - db push 调用点：`tests/helpers/global-setup.ts:22`、`package.json`（`"db:push": "prisma db push"`）、`.github/workflows/ci.yml:127`
  - 应用层检查与扣款分离：`src/server/services/distribution/account.service.ts:243`（前置 count）与 `:294-318`（事务扣款）
- **修复建议**：
  1. 把「在途唯一」改成 Prisma 可表达的方案：新增 `inflightKey String? @unique`（在途时写入 `userId`，终态时置 null），用条件更新维护；或
  2. 至少加一个**迁移守卫脚本**：CI 里 `prisma migrate deploy` 后跑 `SELECT indexdef FROM pg_indexes WHERE indexname='withdraw_records_one_inflight_per_user'`，缺失即失败；并把 `db push` 从测试/CI 流程里换成 `migrate deploy`（见 P2-11）。
  3. 禁止在生产使用 `npm run db:push`（脚本名加 `:danger` 或在脚本里加 `NODE_ENV !== 'production'` 断言）。

---

### P1-9　订单状态写入缺原子认领（TOCTOU）：并发下状态可回归

- **严重度**：P1（资金/履约状态可被并发写坏；与管理端退款交叉时后果升级）
- **现象**：`updateOrderStatus()` 在通过 `canTransition(order.status, to)` 之后，用的是**无条件** `prisma.order.update({where:{id}})`。状态机校验与写入之间是 TOCTOU 窗口：两个并发请求（两个 admin 标签页、或 admin + 顾客确认收货、或批量+单笔）都读到 `status=SHIPPED`，一个切 `DELIVERED`、一个切 `REFUNDED`，后者 `refundEntireOrder` 有行锁+条件更新能挡住；但 `PROCESSING`/`SHIPPED` 这类无副作用的转换是**后写覆盖前写**：会把已 `SHIPPED`（且已发过发货邮件、已写 `shippedAt`）的订单改回 `PROCESSING`，或把已 `DELIVERED` 的订单改回 `SHIPPED`，`shippedAt/deliveredAt` 残留成互相矛盾的组合（`deliveredAt` 有值但 status=SHIPPED）。批量接口 `batch-status` 串行执行也挡不住与单笔接口并发。这也与 P0-3 是同一段状态机代码的两面。
- **代码位置**：
  - 无条件更新（缺 `status: { in: [order.status] }` 条件）：`src/server/services/order.service.ts:1161-1165`
  - 校验与写入分离：`src/server/services/order.service.ts:1109-1115`
  - 批量串行入口：`src/app/api/admin/orders/batch-status/route.ts:55-70`
  - 顾客确认收货入口：`src/app/api/orders/[orderNumber]/confirm-delivery/route.ts:20-24`
- **修复建议**：
  1. `order.service.ts:1161` 改为 `updateMany({ where: { id, status: order.status }, data })`，`count === 0` 时抛「订单状态已变化，请刷新重试」——与 `cancelOrder`（`:970-981`）、`refundEntireOrder`（`:1276-1289`）保持一致口径。
  2. `data` 中同时清理互斥时间戳（例如转 `PROCESSING` 时把 `shippedAt/deliveredAt` 置 null 或者干脆禁止回退），并在 `order-status.ts:21` 的状态机里考虑是否允许 `SHIPPED → PROCESSING` 这类回退。
  3. 加并发测试：`Promise.all` 同时发 PROCESSING 与 SHIPPED，断言最终状态唯一且与 `shippedAt` 自洽。

---

### P1-10　`.env.example` 把 `REQUIRE_STRONG_SECRETS` 留空 —— 空串会被解析成 `false`，**一次性关掉全部生产守卫**

- **严重度**：P1（最危险的默认值：JWT 弱密钥、mock 免费下单、无密码 Redis、占位品牌名四道守卫同时失效，且启动日志毫无提示）
- **现象**：`.env.example:34` 是 `REQUIRE_STRONG_SECRETS=`（**空值**）。`env.ts` 用的是 `z.enum(["true","false","1","0",""])` + `.transform(v => v === "true" || v === "1")` —— **空串是合法取值且被转换成 `false`**，而 `.default("true")` 只在「变量完全不存在」时才生效。于是只要运维按仓库给的样例 `cp .env.example .env`（无论走 `env_file`、`--env-file`，还是裸机 `set -a; source .env`），`REQUIRE_STRONG_SECRETS` 就是显式的 `false`，而它同时是以下四道守卫的总开关：
  1. 弱 JWT 密钥 / 弱 `PAYMENT_CHANNEL_ENC_KEY` 拒绝启动（`src/lib/env.ts:155-181`）
  2. mock 支付（免费下单）拒绝启动（`src/lib/env.ts:240-251`）
  3. 无密码 Redis 拒绝启动（`src/lib/env.ts:277-296`）
  4. 占位品牌名 / 空 `MAIL_FROM` 拒绝启动（`src/lib/env.ts:184-209`）

  另外 `mockPaymentAllowedInProd = ALLOW_MOCK_PAYMENT_IN_PROD || !REQUIRE_STRONG_SECRETS`（`src/lib/env.ts:236-237`）也会随之变成 `true`，于是 `src/app/api/orders/[orderNumber]/mock-pay/route.ts:22-24` 的生产拦截同步失效。也就是说：**一个空等号 = 生产环境可以免费下单 + 弱密钥签发的 JWT + 无密码 Redis**。
- **验证记录**：用真实 `zod` 复现（`NODE_ENV=production` 且变量缺失 → `REQUIRE_STRONG_SECRETS=true` 并命中弱密钥 `throw`；变量为空串 → `false`，守卫全部跳过）。
- **代码位置**：`.env.example:34`、`src/lib/env.ts:9-12`（`booleanFromString` 接受空串）、`:128-130`、`:155-181`、`:236-251`、`:277-296`
- **修复建议**：
  1. `.env.example:34` 直接写 `REQUIRE_STRONG_SECRETS=true`（生产样例就该是安全值），本地演示由 `docker-compose.local.yml:69` 显式覆盖为 `false`（该覆盖已存在，路径本就该这样）。
  2. `booleanFromString` 去掉 `""` 分支，或让空串也落到 `.default()`：`z.enum(["true","false","1","0"]).default(...)` —— 让「没填」与「填了空」都变成安全默认值。
  3. 启动时把守卫结论打进一条 `info` 日志（例如 `[env] REQUIRE_STRONG_SECRETS=true, 已启用 4 项生产守卫`），让「守卫有没有生效」在部署日志里可见。

---

## P2 · 中

### P2-1　COD 到付费 `codFee` **没有做币种换算**（与 order.total 不同币种）

- **严重度**：P2 · **新发现**（与已登记的「COD 跳过支付」无关，这是币种口径问题）
- **现象**：订单的 `subtotal/shippingFee/tax/discount/total` 全部在事务里按汇率换算成**用户结算币种**（`order.service.ts:442-450`），但 `codFee` 直接写 `d(shippingCalc.method.fee)` —— 这是 `ShippingMethod.fee` 的**基础币种（USD）原值**（`shipping.service.ts:102-107`）。CNY 订单（汇率 7.2）到付费 $15 会落成 `codFee = 15`，被客服/仓库/邮件当成 ¥15；COD 确认邮件里 `due = Number(order.total) + codFee` 更是把 CNY 总额与 USD 到费直接相加（`order.service.ts:650-663`），给顾客的「送达应付」金额本身就是错的。
- **代码位置**：`src/server/services/order.service.ts:553`（`codFee: isCOD ? d(shippingCalc.method.fee) : null`）、`:442-450`（其它分量已换算）、`:650-663`（邮件 `due` 混币种相加）、`src/server/services/shipping.service.ts:102-107`（fee 为基础币种）
- **修复建议**：`codFee` 用与 total 相同的汇率换算（`d(toUserCurrency(shippingCalc.method.fee))`），或明确把 `codFee` 定义为「基础币种金额」并在所有展示处显式标注币种（含邮件）；邮件里的 `due` 必须同币种相加。前端结账页的 COD 到付展示也要核对同一口径。

### P2-2　`CouponRedemption.discountAmount` 存的是 USD，却按**订单币种**展示

- **严重度**：P2（账目口径与代码注释相反，用户看到的减免金额错）
- **现象**：核销落库写的是 `dec(params.discountUsd)` —— **USD** 金额（`coupon.service.ts:256`，入参来自 `order.service.ts:609` 的 `coupon.discountUsd`，全程 USD）；但 schema 注释写「实际减免金额（订单币种）」（`prisma/schema.prisma:692-693`），查询层刻意把 `order.currency` 一起返回并让前端按它格式化（`coupon.service.ts:382-403`、`src/app/(shop)/account/coupons/page.tsx:116`）。CNY 订单用 $10 券 → 「我的折扣码·已使用」显示 **¥10.00**（实际应 ¥72.00）。
- **代码位置**：`src/server/services/coupon.service.ts:250-258`、`:369-406`、`src/server/services/order.service.ts:603-611`、`src/app/(shop)/account/coupons/page.tsx:116`、`prisma/schema.prisma:691-694`
- **修复建议**：二选一并统一注释——(a) 落库时换算成订单币种（`discountUsd * exchangeRate`，与 `Order.discount` 同值）；或 (b) 保持 USD 存储，查询层标注 `currency: 'USD'` 并按 USD 展示。建议选 (a)，与 `Order.discount` 对齐、避免同一笔减免两个口径。

### P2-3　S3 预签名上传返回的 `publicUrl` 直接用 `S3_PUBLIC_URL`，为空时给出坏 URL

- **严重度**：P2（S3 模式但未配 `S3_PUBLIC_URL` 时，后台拿到 `/uploads/...` 这种缺前缀/缺 host 的地址 → 商品图全裂）
- **现象**：`storage/index.ts:78-84` 的 `publicUrlFor()` 有兜底（`env.S3_PUBLIC_URL || env.S3_ENDPOINT`），但预签名接口自己拼了另一份：`publicUrl: ${env.S3_PUBLIC_URL}/${result.key}`（`src/app/api/admin/uploads/presign/route.ts:36`）。`isS3Configured`（`src/lib/env.ts:299-303`）**不要求** `S3_PUBLIC_URL`，所以「S3 已配置但没填公网 URL」是合法状态 → 预签名上传成功、返回的 URL 是 `/uploads/products/2026/09/xxx.jpg`，前端 `next/image` 无法加载。此外预签名**没有 `ContentLength`/`content-length-range` 限制**，只能靠客户端自觉（`:28-31` 用 `size: 1` 只校验了 MIME）。
- **代码位置**：`src/app/api/admin/uploads/presign/route.ts:28-38`、`src/lib/storage/index.ts:78-84`、`src/lib/env.ts:298-306`
- **修复建议**：预签名接口改用 `saveUpload` 同款的 `publicUrlFor(key)`（或把 `publicUrlFor` 导出复用）；预签名命令加 `ContentLengthRange` 条件（S3 POST policy）或至少把 `UPLOAD_MAX_BYTES` 传给 `PutObjectCommand` 做签名约束。

### P2-4　`healthz` 在 DB 挂掉时仍返回 200，且没检查 Redis/S3——健康检查等于没有

- **严重度**：P2（DB 断开时容器/编排仍判定健康并继续接流量，排障时会误导）
- **现象**：`GET /api/healthz` 的语义是「进程活着就 200」，DB 不可达时只在 body 里标 `db:"down"`（`src/app/api/healthz/route.ts:19-34`）。但 `Dockerfile:41-42` 的 `HEALTHCHECK` 与 `docker-compose.yml:115-120` 的 healthcheck 都只看 HTTP 状态码（`r.ok` / `wget -qO-`）→ 只要 Node 进程活着就永远 healthy。且完全没检查 Redis（限流/缓存/选主锁）与 S3（图片上传）。注释里说「供 k8s readinessProbe 区分活着与就绪」，但 compose/Dockerfile 用的就是它，等于就绪探针形同虚设。
- **代码位置**：`src/app/api/healthz/route.ts:19-34`、`Dockerfile:41-42`、`docker-compose.yml:115-120`
- **修复建议**：拆两个端点（`/healthz` 存活永远 200；`/readyz` 依赖不可达时 503），compose/Dockerfile 的 `HEALTHCHECK` 指向 `/readyz`；`/readyz` 里加 `redisPing()`（`src/lib/redis.ts:37-45` 已有）与一次 S3 `HeadBucket`（可选），并对每个依赖加短超时。

### P2-5　`invalidateProductsCache()` 用 `redis.keys(prefix*)` 扫全库 —— 会阻塞共享的 Redis

- **严重度**：P2（Redis 同时承载限流计数与选主锁；`KEYS` 是 O(N) 阻塞命令，键一多会卡住所有限流请求）
- **现象**：`cache.ts:86-100` 用 `redis.keys(`${PRODUCTS_CACHE_PREFIX}*`)` 再 `del`。Redis 的 `KEYS` 在单线程里遍历整个 keyspace，键数上万时会产生可观测的延迟尖峰——而同一个 Redis 实例还是 `ratelimit:*` 的存储（`rate-limit.ts:100-104`）与限流熔断（`:137-154`）。后台改一次商品就把全站限流的响应时间拖慢。
- **代码位置**：`src/lib/cache.ts:86-100`（`:90` 的 `keys`）、`src/lib/rate-limit.ts:96-115`
- **修复建议**：改用版本号方案（缓存 key 里带 `version`，失效时只 `INCR products:version`，旧 key 靠 TTL 自然过期），或至少换 `SCAN` 游标分批 `del`。

### P2-6　管理端订单列表/导出的搜索条件**无法走索引**（JSON path + `contains`），随订单量线性劣化

- **严重度**：P2（后台订单检索 + `count()` 在大表上是全表扫；导出 5000 条会明显卡）
- **现象**：`q` 搜索用 `orderNumber: { contains: q, mode: 'insensitive' }`（Postgres `LIKE '%q%'` 用不上 btree 索引）+ `addressSnapshot: { path: ['recipientName'], string_contains: q }`（JSONB 无 GIN 索引）。同样的条件在列表（`src/app/api/admin/orders/route.ts:36-80`，含 `count`）与导出（`src/app/api/admin/orders/export/route.ts:36-66`，`take: 5000`）各出现一次。另外列表的 `orderBy: [{isUnread:'desc'},{createdAt:'desc'}]` 与既有索引 `[isUnread, status]` / `[status, createdAt]` 都不匹配，会走排序。
- **代码位置**：`src/app/api/admin/orders/route.ts:36-45`、`:70-78`；`src/app/api/admin/orders/export/route.ts:36-66`；索引定义 `prisma/schema.prisma:413-422`
- **修复建议**：给 `orders(createdAt)` 已有索引；为搜索加 `pg_trgm` GIN 索引（`orderNumber gin_trgm_ops`）与 `addressSnapshot` 的表达式/GIN 索引；或把搜索限制为「订单号前缀匹配」（`startsWith`，可走 btree）；导出改流式（见 P2-7）。

### P2-7　导出接口一次性把全部数据读进内存

- **严重度**：P2（订单量上来后导出接口内存尖峰/超时；当前 `take: 5000` 只是把上限压低）
- **现象**：`/api/admin/orders/export` `findMany({ take: 5000, include: { user } })` 后 `map` 成整张 CSV 字符串一次返回（`src/app/api/admin/orders/export/route.ts:53-80`）；`/api/user/export` 更是把该账号**全部订单+条目+地址**一次性 `findMany`（`src/app/api/user/export/route.ts:16-34`），且**没有任何限流**（同一用户可以反复触发重查询）。分销的两个导出同理。
- **代码位置**：`src/app/api/admin/orders/export/route.ts:53-80`、`src/app/api/user/export/route.ts:16-34`、`src/app/api/admin/distribution/commissions/export/route.ts`、`src/app/api/admin/distribution/withdrawals/export/route.ts`
- **修复建议**：改为 `ReadableStream` 分批（`cursor` 分页 + 逐行写 CSV）；`/api/user/export` 加 `rateLimit`（例如 3/小时）并给订单加时间/条数上限。

### P2-8　订单号用 `Math.random()` 6 位数字，**无重试**：冲突即下单 500

- **严重度**：P2（单量上来后概率不可忽略：1000 单/天时当天内至少一次碰撞的概率约 40%+）
- **现象**：`generateOrderNumber()` = `ORD` + 日期 + `Math.floor(100000 + Math.random()*900000)`（`src/lib/utils.ts:64-69`）。`Order.orderNumber` 是 unique（`prisma/schema.prisma:350`），但 `createOrder()` 里没有任何重试/捕获 P2002 的逻辑（`order.service.ts:526-600`）→ 碰撞时顾客看到 500，且库存事务回滚（还好），但体验是「点了下单没反应」。
- **代码位置**：`src/lib/utils.ts:64-69`、`src/server/services/order.service.ts:378`、`:526-600`
- **修复建议**：改用 `crypto.randomUUID()` 短哈希/纳秒时间戳 + 随机后缀（冲突概率可忽略），或在 `createOrder` 捕获 `P2002` 后重试 3 次。

### P2-9　`SENTRY_DSN` 没进 compose：生产**没有异常出口**，cron/退款失败只剩日志

- **严重度**：P2（`captureException`/`captureMessage` 全部静默 no-op；P1-7 的退款失败告警彻底没有外呼）
- **现象**：`src/lib/monitoring.ts:14-45` 在 `!env.SENTRY_DSN` 时直接 `return`（静默）。而 `docker-compose.yml` 完全没声明 `SENTRY_DSN`（也没有 `env_file`，见 P0-4），所以经由 compose 部署的生产环境 **Sentry 永不启用**：`captureException`（`src/lib/api.ts:90`）、`captureMessage('[cron] 心跳执行失败')`（`src/server/jobs/scheduler.ts:74`）、汇率退化告警（`currency-server.ts`）全部落空。错误只能靠人肉看日志。
- **代码位置**：`src/lib/monitoring.ts:14-45`、`docker-compose.yml:73-117`（无 `SENTRY_DSN`）、`src/server/jobs/scheduler.ts:72-75`
- **修复建议**：把 `SENTRY_DSN` 加入 compose 显式变量清单；未配置时在启动日志里打印一条 `warn: 监控未启用`（让「没有告警出口」这件事可见，而不是静默）。

### P2-10　发票（PDF）时间用服务器时区，Docker 下是 UTC，中文发票时间偏移 8 小时

- **严重度**：P2（给客户的发票/收据时间与实际下单时间不符，财务留痕瑕疵）
- **现象**：`generateInvoicePdf` 用 `input.createdAt.toLocaleString(c.locale, { hour12: false })`（`src/lib/invoice.ts:166`），**没有 `timeZone`** —— 服务端渲染时用容器的本地时区（`node:20-bookworm-slim` 默认 UTC），zh-CN 发票上会显示 UTC 时间（比北京时间早 8 小时的「昨天」），而站点其它地方（前端）显示的是浏览器本地时间，同一订单两个时间。
- **代码位置**：`src/lib/invoice.ts:166`、`:158`（`dateString(new Date())` 也是 UTC 日）；容器镜像 `Dockerfile:3`/`:14`/`:26`（未设 TZ）
- **修复建议**：给发票显式指定业务时区（`timeZone: 'Asia/Shanghai'`，或做成 `SITE_TIMEZONE` 环境变量并写进 compose）；一并把 `dateString()`（`src/lib/utils.ts:98-100`，`toISOString().slice(0,10)` 即 UTC 日）在「展示用日期」场景替换为业务时区口径。

### P2-11　测试与 E2E 全程用 `prisma db push`，**迁移历史从未被真正验证**

- **严重度**：P2（这正是「表只经 db push、生产 migrate deploy 缺表」这类事故的温床；当前 schema↔migrations 恰好一致，但没有任何机制保证它继续一致）
- **现象**：`tests/helpers/global-setup.ts:22` 用 `prisma db push --skip-generate --accept-data-loss`；CI 的 E2E job 也是 `npx prisma db push --skip-generate`（`.github/workflows/ci.yml:127`）；只有生产 `Dockerfile:47` 走 `migrate deploy`。也就是说 **CI 里没有任何一步会真正执行 `prisma/migrations`**：新同事加字段只跑 `db push`，测试全绿，上线 `migrate deploy` 缺列 → 全站 500。此外 `db push --accept-data-loss` 会静默删掉 schema 表达不了的 DB 对象（见 P1-8）。
- **代码位置**：`tests/helpers/global-setup.ts:20-35`、`.github/workflows/ci.yml:66-73`、`:118-131`、`Dockerfile:44-48`
- **修复建议**：CI 增加一个独立 job：起空库 → `npx prisma migrate deploy` → `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code`（不一致即失败）；集成/E2E 的建库方式改为 `migrate deploy`（这也是验证迁移历史正确性的最省事手段）。

### P2-12　后台可在订单**未收款**时手动把状态改成 PAID（绕过网关，且不触发佣金/确认邮件）

- **严重度**：P2（可凭空造出「已付款」订单并发货；佣金链与邮件链被跳过，财务对账出现无来源收入）
- **现象**：状态机允许 `PENDING_PAYMENT → PAID`（`src/lib/order-status.ts:22`），`updateOrderStatus` 对 `to==='PAID'` 只写 `paidAt = new Date()`（`order.service.ts:1159`），**不校验是否存在支付流水**、不调 `markOrderPaid`，因此也不会触发 `distributionBridge.onOrderPaid()`（佣金计提，`:951`）与「订单已支付」确认邮件（`:900-911`）。后台状态下拉里 PAID 选项对 SUPPORT 也可见（`src/app/api/admin/orders/[id]/status/route.ts:20` 用 `requireStaff`）。
- **代码位置**：`src/lib/order-status.ts:21-29`、`src/server/services/order.service.ts:1158-1159`、`:880-953`（markOrderPaid 的副作用集合）、`src/app/api/admin/orders/[id]/status/route.ts:20`
- **修复建议**：把「手动置 PAID」限制为 ADMIN 并记录 `manual_paid` 类型的 `PaymentLog`（审计可区分），同时补跑佣金计提与确认邮件；更保守的做法是从 `ORDER_STATUS_FLOW` 里移除 `PENDING_PAYMENT → PAID`，只允许经由 `markOrderPaid`。

---

## P3 · 建议

1. **单价的换算是独立舍入，可能出现「单价 × 数量 ≠ 行小计」1 分差**：`order.service.ts:575` 的 `priceUser = toUserCurrency(priceUsd)`（每单位独立 `round2`）与 `:584` 的 `lineSubtotalsUser`（按 `allocateLineAmounts` 对齐到小计）不同源；小额商品 + 非 1 汇率时（如 $0.03 × 3、EUR 0.857 → 单价 0.03、小计 0.08），订单页/发票上「单价×数量」不等于行小计。建议单据上的单价改为「行小计 ÷ 数量」或额外标注舍入说明。位置：`src/server/services/order.service.ts:573-584`。
2. **规格库存回补键用 `组名/值` 拼接、按第一个 `/` 拆分**：`planSpecDeduction` 写 `deducted[`${attr.name}/${attr.value}`]`（`spec-stock.ts:92`），`applySpecRestock` 用 `key.indexOf("/")` 还原（`:125-128`）。若后台把规格名或值本身命名为含 `/`（如 `Black/White`），键会被拆错组/值，取消订单时把库存回到错误的规格上。建议改存结构化 JSON（`{group,value,qty}[]`）或对分隔符做转义。位置：`src/server/services/spec-stock.ts:92`、`:118-135`。
3. **`/api/orders/[orderNumber]/refund` 无限流**：游客凭订单令牌可反复提交退款申请（每次 `notifyAdmins` 通知所有管理员，DB 与消息中心被刷）。位置：`src/app/api/orders/[orderNumber]/refund/route.ts:18-67`。建议加 `rateLimit({key: compositeKey('refund', order.id)})`。
4. **`/api/user/export` 无限流**（与 P2-7 同源）：建议 `3/小时`。位置：`src/app/api/user/export/route.ts:13`。
5. **`notify-me` 限流只按 email，无 IP 维度与全站熔断**：可被用来批量灌库（每条 email 5 次/小时，无 IP 上限）。位置：`src/app/api/notify-me/route.ts:24-25`。建议补 `breakerKey + IP` 维度（其它公开写接口都做了，这里漏了）。
6. **汇率退化为硬编码 7.2 / 内置静态表时对佣金与展示的影响未见告警收敛**：`commission.service.ts:44-52` 的 `currentUsdToCny()` 兜底 7.2，`currency-server.ts` 静态兜底会 `captureMessage(error)` 但无 Sentry 时静默（见 P2-9）。建议：佣金折算记录所用汇率来源（`ConfigSnapshot`/日志字段），便于事后对账。
7. **`mobile`/`Intl` 对 JPY 强制 2 位小数**：`formatMoney`（`src/lib/utils.ts:29-34`）与 `formatAmount`（`src/components/shop/currency.ts:206-221`）都用 `minimumFractionDigits: 2`，JPY 会显示 `¥15,912.54`。金额本身是 2 位小数存储，属显示口径问题；若要按币种习惯显示，需按币种设置小数位。
8. **备份脚本未接入部署，且备份目录不是卷**：`scripts/backup-db.sh` 是「建议挂 cron」的手工脚本，`docker-compose.yml` 里没有任何备份服务/定时任务；`BACKUP_DIR` 默认 `./backups`（`.dockerignore` 排除、compose 未挂卷），在容器内执行会随容器重建丢失。也没有自动化的**恢复演练**（脚本注释里只有一行 `pg_restore` 提示）。建议：compose 增加 backup 侧车 + 命名卷 + 每日 cron，并在 CI/预发定期做一次 `pg_restore` 冒烟。
9. **`PrismaClient` 在非生产不挂 `globalThis`**（`src/lib/prisma.ts:21-23`）依赖「生产单进程共享模块实例」的假设；而 `src/lib/cache.ts:16-21` 的注释明确写了「Next 会按路由拆 bundle、模块可能被实例化多份」。两处假设互相矛盾——若 cache.ts 的观察成立，生产上会按路由创建多个连接池。建议统一验证一次（启动日志打印 `PrismaClient` 实例数或监听 `connection` 事件），并在生产也挂 globalThis（成本为零，收益是消除该不确定性）。标注「需确认」。

---

## 已核查、确认无问题（避免重复投入）

以下方向我逐条验证过，**当前代码是正确/已加固的**，列出以便后续回归时知道边界在哪：

| 方向 | 结论与证据 |
| --- | --- |
| schema ↔ migrations 一致性 | 32 张表全部有 `CREATE TABLE`；逐模型逐字段逐索引比对（含枚举）**无缺失列、无缺失索引**。脚本化验证方法见本报告附录。 |
| admin API 鉴权覆盖 | `src/app/api/admin/**` 全部 73 个 route 文件的每个导出 handler 都有 `requireAdmin`/`requireStaff`；唯一的「导出数 > 守卫数」是 `admin/categories/[id]/route.ts`（PUT/PATCH 共用同一个含守卫的处理函数，`:13-14`）。 |
| IDOR / 越权 | cart（`cart.service.ts:163,174`）、notification（`notification.service.ts:139-162`）、address（`user/addresses/[id]/route.ts:17,40`）、order（`order-access.ts:37-53`）、distribution/my/* 全部带 `userId` 过滤。 |
| 令牌序列化 | `serializeOrder` 主动剥离 `accessToken` 与 `adminNote`（`serializers.ts:33`），游客令牌只在建单响应单独返回（`orders/route.ts:152-161`）。 |
| 金额恒等式 | `total = subtotal + shipping + tax − discount` 在 USD 与用户币种两侧都由单一函数保证（`computeOrderAmounts` / `allocateRateAmounts` / `allocateLineAmounts`），落库值严格成立。 |
| 支付 webhook 幂等 | `markOrderPaid` 用条件 `updateMany` 原子认领（`order.service.ts:869-878`）；`charge.refunded` 用行锁 + 状态判断，且**不再重复发起网关退款**（`order.service.ts:1515-1530`、webhook `:133-137`）。 |
| 库存扣减/回补的三条路径 | `cancelOrder`（`:970-981`）、`refundEntireOrder`（`:1276-1289`）、`markOrderRefundedByGateway`（`:1515-1530`）都有行锁 + 条件认领，不会重复回补；预售按 `stockDeducted` 精确回补。 |
| 优惠券核销/回滚 | 下单在事务内对 `coupons` 行 `FOR UPDATE` 后重校验（`coupon.service.ts:194-229`），核销有 `@@unique([couponId, orderId])` 幂等键，回滚删核销 + `GREATEST(usedCount-1,0)`（`:292-306`）。 |
| 提现/佣金并发 | 提现条件扣减 `balance >= amount` + 事务（`account.service.ts:294-318`）；佣金冲正用 `reversedAmount/reversedCny` 做 CAS 增量推进（`commission.service.ts:345-370`），部分退款按比例增量冲正（`:283-310`）。 |
| 定时任务多实例 | `pg_try_advisory_xact_lock` 选主 + 显式事务超时 + 对账时间预算（`scheduler.ts:60-76`、`:42-57`）。 |
| CSP / 安全响应头 | `next.config.js:3-31` 设了 HSTS/X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy；CSP 由 `src/proxy.ts:240-256` 按请求 nonce 签发，且**不会因准备 CSP 而提前 return 跳过 CSRF/admin 守卫**（`:32-34` 的约束注释 + 实际代码顺序）。 |
| CSRF | 变更请求统一 double-submit 校验（`proxy.ts:289-311`），豁免前缀仅 webhook / csrf / uploads / healthz / notify-me / pay-notify，凭证 cookie 为 `httpOnly + SameSite=Lax`（`session.ts:31-39`）。 |
| XSS | 唯一的 `dangerouslySetInnerHTML` 用于 JSON-LD 与邮件模板，插值来源均为服务端生成串（订单号/格式化金额）；商品描述入库前 `sanitizeHtml`（`admin/products/[id]/route.ts:53`）。政策/FAQ 页以纯文本渲染，无富文本注入面。 |
| 上传安全 | MIME 白名单 + 大小限制（`storage/index.ts:40-55`）、随机文件名（`utils.ts:91-95`）、本地路径前缀校验含 `path.resolve` 后比对（`storage/index.ts:86-94`，`/api/uploads/[...path]` 的穿越尝试会抛错并被 catch 成 404）。 |
| 支付渠道密钥 | AES-256-GCM + 每次随机 IV + authTag（`channel-crypto-core.ts:26-56`）；列表接口对 secret 字段打码（`channel.service.ts:15-17,109-138`）；响应体不含 `configEncrypted`。 |
| 错误信息泄露 | `toApiError` 把未知异常一律归一为 `500 Internal server error`（`errors.ts:99-108`），Zod 只回字段级 message；Prisma 错误/SQL 不外泄。 |
| 空 catch | 未发现吞掉资金/库存异常的裸 catch；`catch {}` 集中在「尽力而为」的旁路（邮件、通知、缓存、审计）且都有 warn/error 日志。 |

---

## 附录：schema ↔ migrations 一致性验证方法（可复现）

```bash
# 1) 表级：schema 的 @@map 表名 vs migrations 的 CREATE TABLE
node /tmp/drift.mjs      # 逐 model 提取 @@map 与字段 @map，比对 CREATE TABLE / ADD COLUMN / RENAME COLUMN
# 结果：MISSING COLUMNS/TABLES = (none)；ENUMS 无缺值；无 ALTER TYPE ADD VALUE 历史

# 2) 索引级：schema 的 @@index/@@unique 名 vs migrations 的 CREATE INDEX
node /tmp/idx.mjs
# 结果：schema-declared indexes not found in migrations = (none)

# 3) 权威比对（需要在本地起一个临时 PG 作为 shadow DB）
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma --shadow-database-url <临时库> --script
```

> 注：第 3 步本次**未执行成功**（沙箱内无可用 PostgreSQL，`--shadow-database-url` 连不上），因此表/列/索引结论基于第 1、2 步的静态比对。**但第 3 步必须进 CI**（见 P2-11），因为静态脚本无法发现「迁移里的 DDL 与 schema 语义不等价」（例如 P1-8 那条只存在于迁移的部分唯一索引）。

---

## 投产前必须修的 Top 10

| # | 问题 | 严重度 | 一句话修复 |
| --- | --- | --- | --- |
| 1 | **P0-1** 零小数币种（JPY）Stripe 收款多收 100 倍，金额校验抓不到 | P0 | `toCents` 按币种改为 `toMinorUnits`（JPY 不 ×100），webhook/对账/退款三处同改，或暂时下架零小数币种。 |
| 2 | **P0-2** 超时取消后仍可付款：钱收了、单取消了、货回补了、无告警 | P0 | Stripe 会话 `expires_at` 与 `ORDER_EXPIRE_SECONDS` 同源；取消前查会话 `expired`；`markOrderPaid` 遇到 CANCELLED/REFUNDED 必须自动退款 + 告警。 |
| 3 | **P0-3** 部分退款后后台改 REFUNDED → 按总额二次全额退款 | P0 | 网关退款金额改为「总额 − 已退金额」，并为差额新建退款单，不再复用部分退款单。 |
| 4 | **P0-4** 生产 compose 的 app 容器必崩（`PAYMENT_CHANNEL_ENC_KEY`/`SITE_NAME` 未注入） | P0 | compose 加 `env_file: .env` 或显式补齐变量；`preflight` 与 `env.ts` 用同一份必填清单。 |
| 5 | **P1-9 / P1-1** `updateOrderStatus` 无条件写状态（并发回归）+ SUPPORT 可单笔全额退款 | P1 | 状态写入改条件 `updateMany(where:{id,status:当前})`；单笔接口的 REFUNDED 提权到 `requireAdmin`。 |
| 6 | **P1-2 / P1-3 / P1-10** 生产守卫被默认值逐个架空：邮件默认 console、`MAIL_FROM` 预设 example.com、`REQUIRE_STRONG_SECRETS=` 空值一票关停全部守卫 | P1 | `env.ts` 增加 `MAIL_PROVIDER=console` 生产守卫；compose 里 `MAIL_FROM` 默认置空；`.env.example` 写 `REQUIRE_STRONG_SECRETS=true` 并让空串回落到安全默认值。 |
| 7 | **P1-4** 后台改库存是绝对值覆盖，静默回滚并发扣减 → 超卖 | P1 | 改增量语义或乐观锁（`updatedAt`/版本号），冲突时拒绝并提示刷新。 |
| 8 | **P1-8 / P2-11** `db push` 会删掉提现防并发索引；测试/E2E 从不验证迁移 | P1/P2 | CI 改为 `migrate deploy` + `migrate diff --exit-code`；把在途唯一约束改成 Prisma 可表达的 `@unique` 列。 |
| 9 | **P1-5 / P1-6** 仪表盘全表加载历史订单 + 游客令牌进日志 | P1 | 营收改 DB 聚合/日汇总表；日志记 `pathname` 并对 `token` 打码，客户端改用 `x-order-token`。 |
| 10 | **P1-7 / P2-9** 退款失败无法重试、告警出口太弱且 `SENTRY_DSN` 未注入 | P1/P2 | 增加退款重试入口 + 运营邮件/告警出口；compose 传入 `SENTRY_DSN`，未配置时启动打 warn。 |

---

*报告结束。全文结论均可按 `file:line` 直接复核；第 3 项（`prisma migrate diff` 权威比对）与 P3-9（生产 PrismaClient 实例数）标注为「需确认」，需要在有数据库/运行环境条件下补验。*

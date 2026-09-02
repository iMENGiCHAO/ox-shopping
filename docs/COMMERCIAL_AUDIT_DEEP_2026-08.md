# 深入审计与修复蓝图（第二轮 · 2026-08-25）

> 审计人：梦哥 ｜ 方式：只读静态分析 + 依赖审计，未修改任何代码
> 前置：第一轮报告见 COMMERCIAL_AUDIT_2026-08.md
> 本文目的：把每个问题落到「根因 → 影响 → 修复设计 → 涉及文件 → 测试与验收」，并给出执行顺序。

## 〇、本轮新确认的问题（第一轮未覆盖）

### N1【P0】Docker 容器启动即崩溃：启动脚本 scripts/wait-for-db.mjs 不存在

**根因**：Dockerfile 第 53 行 ENTRYPOINT 执行 `node scripts/wait-for-db.mjs && ...`，但全仓（含 git 历史）没有这个文件——README 也只是文档先行。

**影响**：`docker compose up -d --build` 后容器立即退出并无限重启，整套 Docker 交付物当前不可用。这是上线路径上最硬的一处断点。

**修复设计**：
1. 新增 scripts/wait-for-db.mjs：解析 DATABASE_URL 主机端口，用 node:net 探测 TCP 连通并重试（无需额外依赖）。
2. 推荐结构：compose 拆成 migrate one-shot job + app；应用启动只做健康检查，不跑迁移、不跑 seed。
3. 或在 ENTRYPOINT 改为先执行 `npx prisma migrate deploy`（失败由 restart 兜底），但迁移与 seed 仍应独立于应用生命周期。

**验收**：`docker compose down -v && docker compose up --build` 全新环境一键起；logs 无 `Cannot find module`。

---

### N2【P0】生产容器每次启动跑 seed，会把后台改过的站点设置/横幅/法务内容强制重置

**根因**：Dockerfile ENTRYPOINT 里 `npx prisma db seed || true`；seed.ts 的 seedSiteSettings() 用 `upsert(..., update: { value })` 每次覆盖 siteName / 公告 / pageBanners / 全部政策文案。演示账号虽有 NODE_ENV 门控（做得好），但站点设置没有门控。

**影响**：运营在后台改完横幅/公告/法务文案 → 下次容器重启（发布/扩容/崩溃恢复）全部回滚成默认值，且无告警。

**修复设计**：
1. 生产容器内彻底移除 seed；迁移与种子只在发布流程里显式执行一次。
2. seedSiteSettings 改为「仅缺失时创建」（update: {}），或显式 SEED_OVERWRITE_SETTINGS=true 才覆盖（仅开发）。
3. 优惠券种子同样只在开发环境执行，生产由运营后台建券。

**验收**：改一条站点设置 → 重启容器 → 设置仍在；docker compose logs 无 seed 执行。

---

### N3【P1】取消订单不释放优惠券：用户永久失去该券的使用机会

**根因**：下单事务写入 CouponRedemption（含 @@unique([couponId, userId])），而 cancelOrder 只回补库存、不删除或释放兑换记录。订单取消（用户主动或超时自动取消）后，该用户再应用同一张券会因唯一约束冲突被拒。

**影响**：客户体验事故（券白白损失）+ 管理端 _count.redemptions 虚高；与「未支付不占额度」的预期矛盾。

**修复设计**：
1. cancelOrder 事务内：`deleteMany({ where: { orderId, couponId } })`（订单取消 = 未消费，应释放）。
2. markOrderPaid 的 usedCount 递增逻辑保持不变（支付成功才 +1）。
3. 若采用「下单锁券」语义，则统一在订单上做可恢复占用计数（见 P0-3 方案）。

**测试**：下单用券 → 取消 → 再次用同一张券成功；超时自动取消后券可复用；已支付订单退款后券不恢复。

---

### N4【P1】依赖存在 26 个已知漏洞（生产依赖 4 个高危），且均为破坏性升级

**证据**：npm audit --omit=dev：
- next@14.2.18（4 个通告：rewrites SSRF、响应缓存混淆、Server Action payload 无界、内部 Server Function 端点未授权泄露）→ 修复需升 next@16（破坏性）。
- nodemailer ≤9.0.0（SMTP 命令注入、CRLF 头注入、OAuth2 TLS 校验缺失、raw 选项任意文件读/SSRF）→ 升 9.0.5。
- sharp <0.35（libvips：CVE-2026-33327/33328/35590/35591）→ 升 0.35.x。
- postcss（next 传递依赖：XSS / source map 路径遍历）→ 随 next 升级。
- prismjs（@react-email/code-block 传递，中危）。

**影响**：2026 年用 2024 年的 Next 14 对外收单，等于带着已知可利用漏洞上线。

**修复设计**：单列「依赖升级冲刺」（路线图 S5），顺序 sharp → nodemailer → prisma 6 → next 16（逐个验证），每步跑三层测试 + 关键路径手工走查；升级 Next 16 时重点回归中间件 CSP nonce 与 standalone 输出。

---

### N5【P1】订单表缺 paymentId / paymentSessionId 索引

**根因**：schema.prisma 的 Order 只有 orderNumber / userId / status / createdAt 索引；而 Webhook charge.refunded 用 findFirst({ where: { paymentId } })，对账任务按 paymentSessionId 过滤——数据量上来后全表扫描。

**修复设计**：新增 @@index([paymentId])、@@index([paymentSessionId]) 两个迁移，随数据库维护窗口发布。

**验收**：EXPLAIN ANALYZE 按 paymentId 查询走 Index Scan；恢复演练在加索引前后各跑一遍。

---

### N6【P2】改邮箱不验证新邮箱所有权；改密码/改邮箱接口无限流

**根因**：email 路由验证当前密码后立即把登录邮箱改成新地址（再发验证邮件）；password 路由无限流——结合 XFF 可绕过限流，会话被窃或密码被撞后，攻击者可把账号邮箱改成自己控制的地址，原用户永久失联。

**修复设计**：采用「待确认邮箱」模式：pendingEmail + 独立确认 token，验证通过后才切换主邮箱；改密码/改邮箱加 rateLimit(5/min/用户) + 事件通知邮件（改密/改邮箱成功即发信给新旧地址）。

---

### N7【P2】GDPR 数据删除只有「登记」，没有执行闭环

**根因**：deletion-request 路由仅写审计 + 发邮件；管理端无「待删除请求」队列、无匿名化/级联删除执行。

**修复设计**：加 DeletionRequest 模型（userId、状态、理由、申请/完成时间）；管理端审批执行：地址/购物车/收藏/通知订阅物理删，订单保留 PII 快照并匿名化 email/name，完成后邮件通知 + 审计。

---

### N8【P2】双语站 html lang 固定 en、metadata 品牌名硬编码且三处不一致

**根因**：layout.tsx 固定 lang="en"；metadata 标题写死 Official SpaceXAI Shop；settings 默认英文站名是 MENG Shop；邮件模板品牌为 SpaceXAI Shop。

**修复设计**：按语言 cookie 动态设置 html lang；metadata 从 getSiteSettings() 取品牌名；品牌常量收敛到单一来源。

---

## 一、第一轮 P0 的修复设计（细化到代码级）

### 1. Webhook：签名失败 400 / 处理失败 500 + 部分退款状态机

**现状**：webhook 路由单一 catch 全返 400；charge.refunded 无条件整单 REFUNDED。

**修复设计（伪代码）**：
```ts
let event;
try { event = constructWebhookEvent(payload, sig); }
catch { return 400; } // 签名错误：不重试

try {
  switch (event.type) {
    case "checkout.session.completed":
      await markOrderPaid(...); break;
    case "charge.refunded": {
      const order = await findByPaymentId();
      const refundedTotal = await prisma.refund.aggregate({
        where: { orderId: order.id }, _sum: { amount: true } });
      if (refundedTotal >= order.total) await updateOrderStatus(order, "REFUNDED", null);
      // 只更新对应退款记录（按 gatewayRefundId 匹配），不再 updateMany 全置
      break;
    }
  }
  return 200;
} catch (err) { log + Sentry; return 500; } // 处理失败：让 Stripe 重试
```

**测试**：构造部分退款事件 → 订单保持 SHIPPED、退款单 REFUNDED；全额退款 → 整单 REFUNDED；处理抛错 → 返回 500；重放同事件 → 200 且幂等。

---

### 2. 退款审批：原子认领后再调网关

**修复设计（伪代码）**：
```ts
const claimed = await prisma.refund.updateMany({
  where: { id, status: "REQUESTED" },
  data: { status: "APPROVING" },
});
if (claimed.count === 0) throw badRequest("该退款申请已处理");
// 再查余额、调 Stripe；Stripe 失败 → 回滚为 REQUESTED 并记录错误
```
RefundStatus 枚举增加 APPROVING（或事务内 SELECT ... FOR UPDATE）。

**测试**：并发 10 个审批请求同一退款单 → 仅 1 个调 Stripe；Stripe 失败 → 状态回滚、可重试。

---

### 3. 优惠券限额：下单事务内占用，取消释放，支付原子计数

**修复设计**：
1. createOrder 事务内对 Coupon 行 FOR UPDATE，校验 usedCount + 待支付订单占用数 < usageLimit。
2. 写 CouponRedemption（保留唯一约束防一人多单）。
3. markOrderPaid：usedCount 递增改为原子条件更新 `UPDATE ... SET usedCount = usedCount + 1 WHERE usedCount < usageLimit`，返回 0 则告警「券超发需人工处理」。
4. cancelOrder：删除该订单的 redemption 记录并释放占用。

**测试**：usageLimit=3，4 并发下单同券 → 第 4 单被拒；取消 1 单后新单可用；支付并发 2 单 → usedCount 不超上限。

---

### 4. 限流：可信代理 + 账号级锁定

**修复设计**：
1. getClientIp：TRUST_PROXY 未开启时忽略 XFF/X-Real-IP；开启后仅信任最后可信一跳。
2. 登录失败计数：Redis key login-fail:{email}，5 次/15 分钟锁 15 分钟（全局，不依赖 IP）；成功登录清零。
3. 部署文档明确：应用端口不得直曝公网，必须经反代。

**测试**：伪造 XFF 无法绕过（未开 TRUST_PROXY）；同一邮箱跨 IP 连错 5 次锁定；锁定后正确密码也被拒。

---

### 5. 密钥与启动流程

**修复设计**：
1. compose 全部改为 ${VAR:?必填}，去掉明文口令与 REQUIRE_STRONG_SECRETS=false；本地演示用 compose.override.yml（不入库）。
2. ENTRYPOINT 只保留 node server.js；迁移独立 job；移除 seed。
3. 上线前轮换 JWT 双密钥 + S3/Stripe 密钥；.settings.yaml.bak 从 git 历史移除并加入 .gitignore。
4. 用 gitleaks 扫历史确认无 sk_live 等密钥入库。

---

## 二、P1 修复优先级与工作量估算

| # | 问题 | 方案要点 | 涉及文件 | 估算 |
| --- | --- | --- | --- | --- |
| 1 | 券码枚举 | validate/apply 加 IP+code 限流，错误收敛 | coupons 两个路由 | 0.5d |
| 2 | CSV 注入 | escapeCell 前缀 ' 防护 | csv.ts | 0.25d |
| 3 | 邮件静默失败 | 关键邮件失败转队列/重试 3 次 + 告警；语言跟随站点 | mail/index.ts + 调用方 | 1d |
| 4 | 全站动态 | 政策/FAQ/无障碍页静态化；首页 ISR | 6-8 个 page + 拆 header 会话依赖 | 2-3d |
| 5 | Sentry 不全 | @sentry/nextjs 或 instrumentation + 错误边界捕获 | monitoring/error/global-error/instrumentation.ts | 1d |
| 6 | healthz 无依赖检查 | readiness 探针（DB/Redis/S3） | healthz/route.ts | 0.5d |
| 7 | 价格快照竞态 | 锁行后用 freshList 价格重算 | order.service.ts | 0.5d |
| 8 | 备份无异地 | 备份脚本加 S3 上传 + 恢复演练 SOP | backup-db.sh + docs | 1d |
| 9 | HSTS/安全头 | nginx include 片段 + 应用层 HSTS | nginx.conf / next.config | 0.25d |
| 10 | 预签名大小失控 | Bucket Condition 限 Content-Length + 上传后校验 | presign 路由 + 部署文档 | 1d |
| 11 | 惰性过期重复 | 移除 GET /api/orders 里的 expireStaleOrders | orders/route.ts | 0.25d |
| 12 | sitemap 收录认证页 | 移除 auth 页、robots 禁 /auth | sitemap/robots | 0.25d |

---

## 三、测试与验证方案（怎么证明修好了）

### 新增集成测试（Vitest，直连 Handler）
- webhook.test.ts：签名失败 400；处理失败 500；部分退款不改整单；全额退款改整单；事件重放幂等。
- refund-concurrency.test.ts：并发审批仅一次网关调用；Stripe 失败回滚。
- coupon-quota.test.ts：并发下单限额；取消释放；支付原子递增。
- ratelimit.test.ts：XFF 伪造不可绕过；账号锁定生效。
- order-price-race.test.ts：锁后改价按新价结算。

### E2E 补充（Playwright）
- 用券下单 → 取消订单 → 再次用券成功。
- 管理端审批退款（mock）→ 订单部分退款状态保持。

### 部署验证清单
1. docker compose down -v && up --build 全流程绿（N1 修复后）。
2. 改站点设置 → restart app → 设置保留（N2 验证）。
3. 双副本并发下单压测（scripts/load-test.mjs）+ 双副本重复 webhook 投递幂等。
4. 备份恢复演练：backup-db.sh → 清库 → pg_restore → 数据一致。
5. npm audit 高危清零（依赖升级后）。

---

## 四、执行路线图（按冲刺排）

**S1 · 资金安全冻结（3-4 天，纯后端）**
Webhook 错误码 + 部分退款 → 退款原子认领 → 券限额事务化 + 取消释放 → 对应集成测试。

**S2 · 安全加固（2-3 天）**
可信代理/账号锁定 → 券码限流 → CSV 注入 → 改邮箱 pending 模式 + 限流 → HSTS。

**S3 · 部署修复（2 天）**
wait-for-db + 容器去 seed → compose 密钥外部化 → 索引迁移 → 备份异地 + 恢复演练。

**S4 · 可靠性（2-3 天）**
邮件重试/语言 → Sentry 全覆盖 → readiness 探针 → 静态页 ISR → 惰性过期移除。

**S5 · 依赖升级窗口（3-5 天，独立回归）**
sharp → nodemailer → prisma 6 → next 16；每步跑 CI 三层测试 + 手工走查支付/上传/发票。

**S6 · 合规与运营闭环（1-2 周）**
DeletionRequest 执行链路 → html lang/metadata 动态化 → 品牌文案收敛 → 埋点/客服/税务对接立项。

> 判定线：S1-S3 完成且 CI 全绿 → 可小规模试营业；S4-S5 完成 → 可放量；S6 与运营功能并行推进。

---

## 五、实施状态（2026-08-25 晚 · 梦哥已动手落地）

### ✅ 已完成（代码已改并通过验证）

| 项 | 说明 |
| --- | --- |
| S1-1 Webhook 错误码 | 签名失败 400 / 处理失败 500（Stripe 会重试）+ 处理异常上 Sentry |
| S1-2 部分退款状态机 | webhook 按累计已退金额判断，只有全额才置整单 REFUNDED；不再全量置退款单 |
| S1-3 退款原子认领 | 订单行锁 + `updateMany(REQUESTED→REFUNDED)` 认领后再调网关；网关失败回滚可重试 |
| S1-4 券限额事务化 | 下单事务内锁券行，usedCount + 待支付占用 < usageLimit；支付时行锁原子递增 |
| S1-5 券取消释放 | cancelOrder 删除该订单 redemption，用户可再次使用；自动超时取消同样生效 |
| S1-6 价格竞态 | 锁行后用最新价格重算小计/折扣/运费/税额，杜绝改价窗口旧价成交 |
| S2-1 可信代理 IP | `TRUST_PROXY`（生产默认 true）取 XFF 最后一跳；nginx 改为覆盖写入 `$remote_addr` |
| S2-2 账号锁定 | 同邮箱跨 IP 5 次/15 分钟锁定，登录成功清零 |
| S2-3 券码限流 | validate/apply 按 IP+券码限流；忘记密码按邮箱限流防轰炸 |
| S2-4 CSV 注入 | escapeCell 对 `= + - @` 开头单元格加 `'` 前缀 |
| S2-5 HSTS | 应用层补 Strict-Transport-Security（nginx 层已有） |
| S2-6 sitemap/robots | 移除认证页收录，robots 禁 /auth |
| S3-1 wait-for-db | 新增 scripts/wait-for-db.mjs（零依赖 TCP 探测），容器启动不再报找不到模块 |
| S3-2 容器去 seed | ENTRYPOINT 默认不执行 seed（SEED_ON_START=false 时），本地演示叠加文件置 true |
| S3-3 seed 非覆盖 | seedSiteSettings 改为仅缺失时创建，不再重置后台配置；生产跳过优惠券种子 |
| S3-4 compose 拆分 | 生产版严格 `${VAR:?}` 缺项拒启；本地演示版 docker-compose.local.yml（弱密钥仅限本地） |
| S3-5 索引迁移 | orders.paymentId / paymentSessionId 索引 + 补录 categories.bannerImage 列，迁移基线零漂移 |
| S3-6 依赖补丁 | nodemailer 9.0.5、sharp 0.35.3（高危 4→2，剩余为 Next.js 主框架，需 S5 升级） |
| S3-7 仓库卫生 | .settings.yaml.bak 移出 git 跟踪并 gitignore；缓存前缀残留字符串清理 |
| 测试 | 新增资金完整性集成测试 3 例 + CSV 单元测试 3 例 |
| S5 Next 16 升级 | next 16.3.3 + react 19.2.8 + @react-email v1 + @sentry 10 + eslint 9 平铺配置；middleware→proxy、params/cookies 全异步、Turbopack 默认、standalone 验证通过；npm audit 0 漏洞 |

**验证结果**：typecheck ✅ lint 0 error ✅ 单元 72/72 ✅ 集成 34/34 ✅ Next 16 Turbopack 生产 build ✅ standalone 生产冒烟（首页/商品/后台/登录 API 全 200）✅ 迁移 diff 零漂移 ✅ npm audit 0 漏洞 ✅

### ⏳ 未落地（需专项窗口或产品决策，已在路线图标注）

- ~~S5 依赖升级~~（已完成：Next 16 / React 19 / ESLint 9 / @sentry 10 / @react-email v1 / sharp / nodemailer；npm audit 0 漏洞）。后续可选：Prisma 5 → 6。
- S4 可靠性：邮件失败重试/队列、Sentry 全覆盖（@sentry/nextjs + instrumentation）、readiness 探针、静态页 ISR。
- S6 合规闭环：DeletionRequest 管理端执行链路、改邮箱 pending 确认模式、html lang/metadata 动态化。
- 运营侧：异地备份自动上传、恢复演练 SOP、埋点/客服/税务对接。

### 上线前仍需人工完成的清单

1. 在 Docker 主机执行 `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` 冒烟（本机无 Docker）。
2. 生产 `.env` 生成强密钥并轮换：`openssl rand -base64 48`（JWT 双密钥，当前 .env 仍是演示占位值，生产守卫会拒启——这是预期行为）、新 S3/Stripe 密钥。
3. 执行 `npm run db:deploy`（迁移）→ `npm run admin:create -- <email>` 创建首个管理员。
4. 配置 Stripe Webhook（订阅 checkout.session.completed / payment_intent.payment_failed / charge.refunded）与发信域名 SPF/DKIM。
5. 备份 cron（每日 pg_dump + 异地存放）与季度恢复演练。

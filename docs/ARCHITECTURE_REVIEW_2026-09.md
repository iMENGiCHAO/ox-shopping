# 架构评审与优化任务书（2026-09）

> **本文档的读者**：后续接手做修改/优化的 AI 智能体（以及协作工程师）。
> **评审人**：资深全栈架构视角，2026-09-05 基于仓库代码、git 历史与 docs/ 既有文档核验。
> **本文档定位**：按优先级给出可执行的优化任务清单（含问题证据、目标文件、方案方向、验收标准），
> 并划出**禁止触碰的承重墙**。不替代 `docs/SESSION_SUMMARY.md`（会话工作记忆）与
> `docs/AGENT_CONVENTIONS.md`（开发契约）——动手前仍须先读这两份。

---

## 0. 一句话结论

**项目整体质量显著高于普通"可商用模板"，资金与订单链路防御扎实（行锁防超卖、退款事务、webhook 幂等、状态机校验、审计日志）。**
主要短板不在功能，而在四件事：**i18n 非路由级（SEO 硬伤）、自建认证存在已注释的竞态缺陷、proxy 单文件职责过载、多实例部署下调度器竞态**。
其余为工程卫生与文档对齐问题。

---

## 1. 承重墙 —— 禁止触碰清单（除非专门任务并跑满全套测试）

以下逻辑是整条资金/安全链路的承重墙。**任何"顺手重构""风格统一"性质的改动都不允许落到这些位置**；
若确有 bug，先在汇报中列出证据，经确认后再动，且必须跑 `tests/integration/financial-integrity.test.ts` 等全套测试。

| # | 位置 | 保护理由 |
|---|---|---|
| W1 | `src/server/services/order.service.ts` 订单创建/取消/退款的事务与行锁（`$transaction` + `SELECT ... FOR UPDATE` + `updateMany where stock >= qty` 检查 rowCount） | 并发防超卖的唯一保证 |
| W2 | 优惠券核销原子性（`computeCouponDiscount` / `findUsableCoupon` / `couponRedemption.create` 同事务） | 防恶意占用/超发 |
| W3 | `src/proxy.ts` 的 CSRF 校验与豁免清单（`/api/webhooks/` `/api/auth/csrf` `/api/uploads/` `/api/healthz` `/api/notify-me`） | 豁免是**有意**的，每个都有防御理由（签名验证/限流/去重） |
| W4 | `src/proxy.ts` 生产 CSP 的 `nonce + strict-dynamic` 结构 | 改坏即整站脚本失效或安全回退 |
| W5 | `src/lib/payment-gateways.ts` 的 `auto / stripe / mock` 降级判定 | 无密钥自动降级是"零配置可跑"承诺的基础 |
| W6 | `src/lib/env.ts` 的强校验（`REQUIRE_STRONG_SECRETS` 生产弱密钥拒绝启动） | 防"忘了换密钥就上线" |
| W7 | 预售库存 `GREATEST(stock - qty, 0)` 兜底语义 + 取消时精确回补 | 这是**有意的预售语义**（允许 0 库存下单、按实扣回补），不是 bug，勿改回严格扣减 |

---

## 2. 项目现状速查（修正过时认知）

接手前请以**本表为准**，不要依赖旧文档里过时的描述：

- **框架**：Next.js **16.3.3**（App Router，Turbopack）+ React 19 + TypeScript 严格模式（`noUncheckedIndexedAccess`）。
  注意：**不再是 Next 14**；`src/middleware.ts` 已更名为 `src/proxy.ts`（Next 16 约定，见 `node_modules/next/dist/docs/`）。
- **数据库**：PostgreSQL 16 + Prisma 5.x，**迁移历史已存在**（`prisma/migrations/` 下 5 个迁移：init / payment_log / order_payment_indexes / category_banner_image / business_core_tables）。
  生产/CI 用 `prisma migrate deploy`，开发可 `db push`。
- **认证**：自建 JWT（jose）+ httpOnly Cookie + refresh 轮换（DB 存 hash）+ 重放检测 + bcrypt(12) + CSRF double-submit。
- **支付**：Stripe Checkout + Webhook（签名验证 + 幂等）；未配置密钥自动降级模拟支付。
- **降级矩阵**：支付 Stripe↔mock；邮件 Resend/SMTP↔console（落盘 `.mail-out/`）；存储 S3↔本地（`storage/`）；Redis 可关闭降级内存实现。
- **可观测性**：pino 结构化日志 + 请求 ID 贯穿（`REQUEST_ID_HEADER`）+ Sentry 可选。
- **进程内调度器**：`src/server/jobs/scheduler.ts`（订单过期取消 / token 清理 / 掉单对账），挂在 `src/lib/prisma.ts` 单例上，`CRON_ENABLED=false` 可关。
- **测试**：Vitest（unit/integration）+ Playwright（E2E，3 个 spec）+ `tests/integration/financial-integrity.test.ts`。
- **已知环境坑**（见 `SESSION_SUMMARY.md` §5）：本机为 Time Machine 卷，dev 模式 webpack 缓存易挂起，**验证一律走生产构建**（`npm run build && npm start`）。

---

## 3. 优化任务清单

按优先级排序。每项独立成任务、独立提交，commit/PR 注明任务编号（如 `P0-1`）。
**默认禁止安装新依赖**（沿用 AGENT_CONVENTIONS 铁律 11）；若任务确实需要新依赖，在最终汇报中说明理由，不擅自引入。

---

### P0-1（最高优先）：修复 refresh token 轮换"链断裂"竞态 `[x]` ✅ 提交 `71ff128`（2026-09-05）

- **问题证据**：`src/lib/auth/session.ts` 约 125 行注释自述——
  *"标 replacedBy 失败时链断裂，下一次轮换会把合法新 token 当作重放误吊销"*。
  后果：偶发地把合法用户**登出全部设备**（`revokeAllUserTokens`），属账号可用性缺陷。
- **目标文件**：`src/lib/auth/session.ts`（`rotateSession` / `revokeAllUserTokens`），必要时 `src/lib/auth/jwt.ts`。
- **方案方向**（任选其一，改动越小越好）：
  1. 轮换时若旧 record 为 `revokedAt` 但 `replacedBy` 为空（链断裂特征），则**信任新 token**、继续建立新链，而非吊销全部；
  2. 或引入"断裂容忍窗口"：仅在 replacedBy 链完整闭合时才视为重放。
- **验收标准**：
  - 新增集成测试：模拟"轮换中途失败→客户端用新 token 再次轮换"场景，断言**不被误吊销**；
  - 既有重放检测测试（真重放仍吊销全部）不回归；
  - `npm run typecheck` + `npm run test:unit` + `npm run test:integration` 全绿。
- **风险提示**：认证是承重墙邻域，改动必须小步、有测试锚定，禁止顺手重构。

---

### P1-1：i18n 迁移到路由级 locale（SEO 硬伤，商业价值最大） `[x]` ✅ 第一/三步完成（2026-09-05）

> 采用**方案 B**（与用户确认）：无前缀 = 英文（现状不变，不破坏现有链接/收录），
> `/zh` 前缀 = 中文、`/en` = 显式英文。
> - ✅ 第一步（路由结构 + 语言注入）提交 `1699cac`：`proxy.ts` 识别 `/zh|/en` 前缀 →
>   注入 `x-lang` + rewrite 去前缀；`getLang()` 优先读 `x-lang`，`<html lang>` 自动跟随。
> - ✅ 第三步（SEO 输出）提交 `195920d`：页面 generateMetadata 加 canonical+en/zh/x-default
>   hreflang；sitemap.xml 每条 URL 带 3 条 xhtml:link hreflang。实测通过。
> - ⏳ 第二步（语言切换器改"导航式跳 locale 路径"，替换 cookie+refresh 运行时切换）：未做
>   （属 UX 细化，非 SEO 必需；SEO 收录已由第一/三步达成）。

- **问题证据**：`src/lib/shop-i18n.ts` 注释明确——
  *"Language state is managed by I18nProvider (client context)"*。
  语言在客户端运行时切换，**非路由级 `/zh` `/en`，无 SSR 语言感知**。电商 SEO 是生命线，SPA 式语言切换对搜索引擎收录不利。`docs/I18N_MIGRATION.md` 已有部分方案，先读。
- **目标范围**：`src/lib/shop-i18n.ts` / `admin-i18n.ts`、`src/app/(shop)/layout.tsx` 与各页面语言注入、`src/components/shop/lang-provider.tsx`、sitemap/robots/JSON-LD 输出。
- **方案方向**：
  1. 路由级 `/en` 前缀（中文保持默认无前缀，避免破坏现有链接与收录）；
  2. 服务端按 pathname 注入语言，SSR 输出正确 `lang` 属性与 `hreflang`；
  3. 保留客户端切换能力但改为**导航式切换**（跳转对应 locale 路径），移除纯 context 运行时切换。
- **验收标准**：
  - `/en` 路径可完整访问（首页/PLP/PDP/购物车/订单）；
  - sitemap 输出 `hreflang` 交替链接；页面 `<html lang>` 正确；
  - 无前缀路径行为与现状一致（不回归）；
  - `typecheck` + `build` 通过，关键页 200。
- **风险提示**：这是**大改动**，建议拆成独立任务串行完成（先路由结构，再语言注入，再 SEO 输出），每步可独立验证。

---

### P1-2：proxy.ts 职责拆分 + CSP nonce 修正 `[x]` ✅ 提交 `b1c20d9`（2026-09-05）

- **问题证据**：`src/proxy.ts` 单文件四职责——请求 ID / CSP / CSRF / admin 守卫；且 Next 16 proxy 默认 Node runtime，**每个页面请求都过 Node 中间件**。CSP nonce 用 `btoa(crypto.randomUUID())`——UUID 仅 122bit 随机性且含固定位，nonce 应为无偏随机。
- **目标文件**：`src/proxy.ts`，可新增 `src/lib/server/proxy-*.ts` 纯函数模块。
- **方案方向**：
  1. 拆成纯函数组合：`withRequestId` → `withCsp` → `withCsrf` → `withAdminGuard`，每个返回布尔/响应，proxy 只做编排；
  2. nonce 改 `crypto.randomBytes(16).toString("base64")`；
  3. matcher 已收窄，保持。
- **验收标准**：
  - 生产构建后抽查页面响应头：CSP 含 `nonce-` 且页面交互正常（strict-dynamic 未破坏脚本）；
  - CSRF 与 admin 守卫行为不变（`tests/integration/middleware.test.ts` 及既有集成测试全绿）；
  - 请求 ID 贯穿行为不变。
- **风险提示**：改完必须**生产模式**验证（dev 宽松 CSP 会掩盖问题）。

---

### P1-3：调度器多实例分布式锁（多副本部署前必做） `[x]` ✅ 已提前完成，无需改动（2026-09-05 核验）

> 核验结论：`src/server/jobs/scheduler.ts` 已用 Postgres 事务级咨询锁
> `pg_try_advisory_xact_lock(918273645)` 选主（非文档所述"仅 globalThis 守卫"）；
> `start.ts` 的 `globalThis.__cronStarted` 只防 dev HMR 重复注册。此实现优于本文档
> 建议的 Redis `SET NX EX`：①不依赖 Redis（REDIS_ENABLED=false 仍安全）②事务结束
> 锁自动释放、崩溃无残留（Redis 需 TTL 兜底，有提前过期双跑窗口）③对账任务已在锁内，
> 多实例不重复对账。RUNBOOK-multi-instance.md §二 已记录该语义。故不引入 Redis 锁方案。

- **问题证据**：`src/server/jobs/scheduler.ts` 的 `globalThis` 守卫只防**单进程内**重复；
  多副本部署时每个副本都会执行"订单过期取消 / 掉单对账 / token 清理"——**对账任务重复执行是真实资金/数据风险**。
- **目标文件**：`src/server/jobs/scheduler.ts`、`src/server/jobs/start.ts`、`src/lib/redis.ts`。
- **方案方向**：
  1. 用 Redis `SET key "1" NX EX <ttl>` 抢调度锁（key 如 `scheduler:leader`），抢到才跑本轮，跑完/过期释放；
  2. Redis 关闭（降级内存）时**保持现状单实例执行**（本地/单机不受影响）；
  3. ttl 需大于单轮任务最长执行时间，避免锁提前过期双跑。
- **验收标准**：
  - 单实例行为与现在完全一致（本地测试通过）；
  - 文档说明多实例部署时的调度语义（可写入 RUNBOOK）；
  - 无 Redis 环境不报错、不跳过关键任务（订单过期取消仍需执行）。
- **风险提示**：订单过期取消是用户可见行为，改动后务必跑下单→超时→取消链路测试。

---

### P2-1：specStock 等 Json 字段的一致性治理 `[x]` ✅ 提交 `7adadb7`（2026-09-05）

- **问题证据**：`prisma/schema.prisma` 中 `specStock` / `images` / `attributes` 均为 `Json` 类型。
  其中 **`specStock` 参与库存扣减**（见 `src/server/services/spec-stock.ts` 与订单扣减路径），
  一致性完全靠应用层代码保证，多入口写入（admin 改规格、下单扣减、取消回补、种子脚本）任一偏差都会造成"规格库存与实扣不符"。
- **目标文件**：`src/lib/validations/product.ts`（或新增 spec-stock 校验器）、`src/server/services/spec-stock.ts`、admin 商品表单写入路径。
- **方案方向**：
  1. 为 `specStock` 定义 zod schema（结构、数量非负、与 `attributes` 取值一致），所有写入入口统一过校验；
  2. 补一条跨入口集成测试：admin 改规格 → 下单扣减 → 取消回补 → 断言 specStock 守恒。
- **验收标准**：`tests/unit/spec-stock.test.ts` 与新增集成测试全绿；多入口写入口均过校验。
- **风险提示**：属数据一致性敏感区，先加测试锚定现状，再引入校验。

---

### P2-2：仓库卫生（数据目录与构建产物） `[x]` ✅ 提交 `915f58e`（2026-09-05）

- **问题证据**：项目根存在 `.pg-data/`（Postgres 数据目录）、`.test-pg-data/`、`.test-postgres/`、`.test-pg17/`、`.test-pg-manual/`、
  `.mail-out/`（邮件落盘，2.2MB+）、`tsconfig.tsbuildinfo`（2.2MB）。虽未被 git 追踪，但 **Time Machine 备份会全部带走，备份盘持续膨胀**。
- **目标文件**：`.gitignore`（加固）、`src/lib/mail/index.ts`（落盘目录可配置化，如 `MAIL_OUT_DIR`，默认仍 `.mail-out`）。
- **方案方向**：
  1. `.gitignore` 显式列出 `.pg-data/` `.test-pg*/` `.mail-out/` `*.tsbuildinfo`（确认覆盖后 `git status` 干净）；
  2. 邮件落盘目录改为环境变量可配，方便部署时指向卷外。
- **验收标准**：`git status --short` 无新增噪声；本地跑一次发信流程确认落盘路径可配置且默认行为不变。

---

### P2-3：文档与现实对齐（README / AGENT_CONVENTIONS） `[x]` ✅ 提交 `915f58e`（2026-09-05）

- **问题证据**：
  - `README.md` 称"仓库未内置迁移历史目录"——**实际 `prisma/migrations/` 已有 5 个迁移**；
  - `docs/AGENT_CONVENTIONS.md` 写 "Next.js 14"、"`src/middleware.ts`"——**实际 Next 16 + `src/proxy.ts`**；
  - 两处会让接手智能体按错误信息操作。
- **目标文件**：`README.md`、`docs/AGENT_CONVENTIONS.md`。
- **方案方向**：仅修正上述事实性描述（迁移历史存在、框架版本、proxy 命名、client 组件 import 白名单是否仍有效），**不扩展重写**。
- **验收标准**：按更新后的文档步骤可复现（`db:migrate` 说明、proxy 文件引用准确）。

---

### P2-4：视觉回归基线（工程流程，止血"像素盲调"） `[x]` ✅ 提交 `40f830e`（2026-09-05，待人工核对基线）

- **问题证据**：git log 显示大量像素级往返提交（header gap 12px→24px→32px→48px、LOGO 黑白两次 revert），
  且 `SESSION_SUMMARY.md` 记载"官方站不可达时只能估"——这是**无视觉基线**的盲调症状，迭代成本高。
- **目标文件**：新增 `tests/e2e/visual.spec.ts`（或独立脚本），锁定关键页截图基线。
- **方案方向**：Playwright 对首页/PLP/PDP/购物车/搜索弹层做截图对比（`toHaveScreenshot` 或 pixelmatch），
  基线入库；后续 UI 改动以"基线差异"为验收输入，而非主观目测。
- **验收标准**：基线生成并可重复运行；CI 中加入该任务；一次故意改像素能触发失败。
- **风险提示**：基线生成需固定视口与网络（图片需等待加载完成或 mock），首次生成基线时人工核对正确性。

---

## 4. 验证流程（每项任务交付前必须执行）

```bash
npm run typecheck          # 0 error
npm run lint               # 0 warning（或说明遗留）
npm run test:unit          # 单元测试
npm run test:integration   # 需 PostgreSQL（.env.test）；含 financial-integrity
npm run build              # 生产构建
npm start                  # 生产模式，关键页 200（本机 dev 有已知 ENOENT 坑，验证一律走生产）
```

- 涉及承重墙（§1）的任务，额外必须跑 `tests/integration/financial-integrity.test.ts` 并全绿；
- 涉及支付/订单的改动，本地走一遍：下单 → 模拟支付 → 发货 → 退款全链路；
- 数据库敏感操作后还原测试数据（沿用 SESSION_SUMMARY §6 约定）。

## 5. 推荐执行顺序

1. **P0-1**（认证竞态，小而关键）
2. **P2-4**（视觉基线，立刻止血 UI 迭代成本，建议在 UI 类任务前先做）
3. **P1-3**（调度器锁，多实例上线前必做）
4. **P1-2**（proxy 拆分 + nonce）
5. **P1-1**（i18n 路由级，独立串行，商业价值最大但改动面大）
6. P2-1 / P2-2 / P2-3（工程卫生，可穿插）

## 6. 协作约定（给优化智能体）

- 动手前必读：`docs/SESSION_SUMMARY.md`（工作记忆/坑位）、`docs/AGENT_CONVENTIONS.md`（开发契约）、本文件；
- 每项任务独立提交，信息注明任务编号（`P0-1` 等）；
- **默认不安装新依赖**；不修改承重墙（§1）范围内的逻辑；
- 发现承重墙内有 bug：不擅自改，在汇报中列证据，待确认；
- 完成每项后更新本文件任务状态（`[ ]` → `[x]` + 提交号），保持文档即台账。

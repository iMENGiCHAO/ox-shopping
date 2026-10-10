# 🛠️ 开发指南

> 目标读者：要在本仓库写代码的人。跑通项目请先看 [README 快速开始](../README.md#一键启动推荐docker)。

## 1. 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（CI 用 20） | 推荐 LTS |
| PostgreSQL | 16 | 低版本会在迁移/备份脚本处被版本守卫拦下 |
| Redis | 7 | **可选**——未配置时自动降级，不阻塞启动 |
| Docker | 任意现代版 | 仅演示/冒烟需要；纯本地开发可不装 |

安装依赖：`npm install`（postinstall 自动执行 `prisma generate`）。

## 2. 目录结构详解

```
src/
├── app/
│   ├── (shop)/              # 商城前台路由组：首页/PLP/PDP/购物车/结算/账户
│   ├── admin/               # 管理后台 26 个页面（见 admin-guide.md）
│   ├── auth/                # 前台登录/注册/找回密码
│   └── api/                 # REST 接口（/api/admin/*、/api/webhooks/stripe…）
├── components/
│   ├── shop/                # 前台组件（含 currency 多币种模块）
│   └── admin/               # 后台组件（数据表格、表单、上传）
├── lib/                     # 领域逻辑：auth/ payment/ db/ api.ts/ env.ts/ errors.ts
├── server/                  # 仅服务端模块
├── emails/                  # 事务邮件模板
├── proxy.ts                 # 中间层（CSRF/JWT 旋转/安全头/语言）
└── instrumentation.ts       # 启动钩子（生产密钥强度守卫在此拦截）
prisma/                      # schema + migrations + seed.ts（种子含演示目录数据）
scripts/                     # 备份/恢复演练、冒烟、QA 门禁、运营脚本
tests/
├── unit/                    # 纯逻辑单测（vitest）
├── integration/             # 真 DB 集成测试（vitest，自动 db push + seed）
├── e2e/                      # Playwright 端到端 + __screenshots__ 视觉基线
└── helpers/                  # global-setup（含 _test 库安全守卫）
```

**目录红线**：`server/` 与 `lib/server/` 里的模块**禁止**被客户端组件引入（`"use client"` 文件），lint 会拦。

## 3. 数据库工作流（日常最重要的部分）

### 3.1 改 Schema

```bash
npm run db:migrate -- --name add_foo_column   # 生成迁移（开发库）
npm run db:generate                            # 重新生成客户端类型（改 schema 后必跑）
```

约定：
- **永远用迁移**，不要 `db push` 到共享/生产库（`db:push` 仅供集成测试前的本地重置）。
- 迁移必须能在**空库**上按序执行——CI 的「空库迁移门禁」会在全新数据库跑全量迁移并比对 schema。
- 有破坏性变更（删列/改类型）时写两步迁移：先加新列迁数据，下个版本再删旧列。

### 3.2 种子数据

```bash
npm run db:seed        # 幂等；开发/测试模式含演示账号
npm run admin:create   # 生产建管理员（交互式，不走演示账号）
```

种子在 `NODE_ENV=production` 下默认**跳过演示账号**（生产护栏），需要时显式 `SEED_DEMO_ACCOUNTS=true`。

### 3.3 E2E 数据库守卫

Playwright 的 global-setup 会检查 `DATABASE_URL`：**库名必须以 `_test` 结尾**，否则拒绝运行（防止误把 E2E 指向开发/生产库）。本地跑 E2E 前：

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/ecommerce_test?schema=public" npm run test:e2e
```

### 3.4 备份与恢复

```bash
npm run db:backup          # 手动备份（scripts/backup-db.sh）
bash scripts/backup-restore-drill.sh   # 恢复演练：备份→建临时库→恢复→校验→清理
```

## 4. 环境变量速览

完整清单见 [.env.example](../.env.example)。zod 启动校验在 `src/lib/env.ts`——**漏配/错配会在启动时炸出来**，不会静默生效。

| 变量 | 开发默认 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 本地 ecommerce 库 | 唯一必填 |
| `REDIS_URL` | 空 | 可选；未配自动降级 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | — | 生产必须 ≥32 位随机值 |
| `PAYMENT_CHANNEL_ENC_KEY` | — | 渠道密钥 AES 加密主钥，生产必须 ≥32 位 |
| `PAYMENT_MODE` | `auto` | `stripe` / `mock` / `auto`；生产禁 `mock`（启动守卫） |
| `STORAGE_DRIVER` | `local` | `s3` 时需配 S3_* 全套 |
| `MAIL_PROVIDER` | `console` | `resend` / `smtp` / `console`（本地打印不真发） |
| `SITE_URL` / `SITE_NAME` | — | 站点地址与品牌名 |

## 5. 命令速查

| 场景 | 命令 |
| --- | --- |
| 开发服务器 | `npm run dev` |
| 类型检查 | `npm run typecheck` |
| Lint / 修复 | `npm run lint` / `npm run lint:fix` |
| 单测 / 集成 | `npm run test:unit` / `npm run test:integration` |
| E2E（首次先装浏览器） | `npm run test:e2e:install && npm run test:e2e` |
| 提交前一把梭 | `npm run verify`（typecheck + QA 静态门禁 + 单测） |
| Docker 演示冒烟 | `npm run smoke:docker` |
| 数据库 GUI | `npm run db:studio` |

QA 静态门禁（`npm run qa:static`）= 硬编码检查 + 错误文案语言检查 + 死链检查，CI 的 Lint 作业会跑同一套。

## 6. 开发规范

- **提交信息**：`feat|fix|docs|style|refactor|test|chore(scope): 中文一句话说清动机`。看 `git log` 的前 200 条就能感受到本仓库的品味。
- **错误文案**：禁止在路由/组件里硬编码面向用户的中文文案。统一走 `src/lib/errors.ts` 的错误码 + `error-i18n` 本地化（QA 门禁会扫描）。
- **金额**：数据库统一存**最小单位整数**（分），展示层做格式化；币种与汇率见 `src/components/shop/currency.ts`。
- **时间**：DB 存 UTC，展示按用户时区。
- **不引入新依赖**前先想：能不能用现有工具组合解决？引入时跑 `npm audit --omit=dev` 确认无 high/critical（CI 会再查一遍）。

## 7. 常见任务配方

### 加一个前台页面

1. `src/app/(shop)/your-page/page.tsx`（服务端组件优先，数据用 Prisma 直取）
2. 需要交互的部分抽 `"use client"` 子组件放 `components/shop/`
3. 若有接口：`src/app/api/.../route.ts` 用 `apiHandler` 包装（自动错误信封 `{ error }`、成功 `{ data }`）

### 加一个 API

```ts
export const GET = apiHandler(async (req) => {
  // 鉴权：requireUser(req) / requireAdmin(req)
  return json({ foo: "bar" });          // → { data: { foo: "bar" } }
});
```

变更方法（POST 等）自动被 proxy 做 CSRF 校验，前端用 `lib/fetch-client.ts` 的 `apiFetch`——它会自动带 `x-csrf-token`。

### 加一条迁移并验证

```bash
# 1. 改 prisma/schema.prisma
npm run db:migrate -- --name your_change
npm run db:generate && npm run typecheck
# 2. 空库自证（和 CI 同款检查）
createdb ecommerce_gate && npx prisma migrate deploy --skip-generate \
  && echo OK
# 3. 相关单测/集成测试补齐
```

### 排查「页面白屏/接口 403」

1. 403 且 `CSRF_FAILED` → 检查请求是否漏带 `x-csrf-token`（用 `apiFetch` 就不会漏）
2. 启动即退出且提示密钥强度 → 生产模式给了弱密钥；本地演示设 `REQUIRE_STRONG_SECRETS=false`
3. E2E 拒跑 → `DATABASE_URL` 库名不是 `_test` 结尾

## 8. 相关文档

- [架构说明](architecture.md)——为什么这样设计
- [测试体系](testing.md)——四层测试怎么写、视觉基线怎么更新
- [后台使用手册](admin-guide.md)——功能地图

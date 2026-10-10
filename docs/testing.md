# 🧪 测试体系

四层金字塔，全部命令化；CI 里 9 道门禁有一半是测试（见 [架构说明 §6](architecture.md#6-ci-流水线9-道门禁)）。

| 层 | 工具 | 数据库 | 跑法 |
| --- | --- | --- | --- |
| 单元测试 | Vitest | 不需要 | `npm run test:unit` |
| 集成测试 | Vitest | 真 PostgreSQL | `npm run test:integration` |
| 端到端 | Playwright | 真 PostgreSQL（自动迁移+种子） | `npm run test:e2e` |
| 视觉回归 | Playwright 截图比对 | 同上 | 随 E2E 自动执行 |

## 1. 单元 / 集成（`tests/unit/`、`tests/integration/`）

- 单测针对纯逻辑：金额计算、加密、校验器、状态机。
- 集成测试跑在**真数据库**上——vitest 钩子自动执行 `prisma db push`（强制同步 schema）+ 种子，所以断言可以直查表。
- 集成测试的 `DATABASE_URL` 由测试 setup 管理本地库；断言用 Prisma 客户端直查，别绕 HTTP。

写法约定：文件与被测模块同构（`src/lib/foo.ts` → `tests/unit/lib/foo.test.ts`），断言优先「行为」而非「实现细节」。

## 2. 端到端（`tests/e2e/`）

```bash
npm run test:e2e:install    # 首次：安装 chromium
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/ecommerce_test?schema=public" \
  npm run test:e2e
```

### ⚠️ `_test` 库安全守卫

`tests/helpers/global-setup.ts` 在启动时检查：**`DATABASE_URL` 的库名必须以 `_test` 结尾**，否则立即拒绝运行。

```text
[global-setup] DATABASE_URL database name must end with the literal suffix _test; refusing to run
```

这是防止 E2E 误指开发库/生产库的最后一道闸——**不要绕过它**，照规矩建 `xxx_test` 库。

### 视觉回归

- 基线目录：`tests/e2e/__screenshots__/视觉回归基线-*/`
- 比对阈值：`maxDiffPixelRatio 0.02`（像素差异容忍 2%）
- 配置里 `snapshotPathTemplate` **不带平台段**：基线跨平台共享，因此**必须由 CI 平台（Linux）生成**——macOS 本地生成的基线因字体渲染差异会在 CI 上全军覆没（本仓库踩过，见 CHANGELOG 2026-10-10）。

**界面改版后更新基线的正确姿势**：到 GitHub Actions 手动触发 **`update-visual-baselines`** 工作流（workflow_dispatch）。它会起真库、跑迁移种子、在 Linux chromium 下 `--update-snapshots` 生成并回验一遍，产物 `visual-baselines` 里就是可直接提交的新基线。

```text
Actions → update-visual-baselines → Run workflow → 下载 artifact → 覆盖 tests/e2e/__screenshots__/ → 提交
```

## 3. CI 门禁与测试的对应关系

| CI 作业 | 本地等价 |
| --- | --- |
| Unit & Integration Tests | `npm run test:unit && npm run test:integration` |
| Playwright E2E（含视觉回归） | 见上节命令 |
| Empty DB Migration Gate | 空库跑全量迁移 + schema 比对（[开发指南 §7](development.md#7-常见任务配方) 有本地复刻法） |
| Lint & Typecheck + QA 静态门禁 | `npm run verify` |
| Backup Restore Drill | `bash scripts/backup-restore-drill.sh` |
| Final Docker / Compose Smoke | `npm run smoke:docker`（需 Docker） |

提 PR 前建议本地过一遍 `npm run verify`——CI 挂同款检查，本地先红比远程先红省 20 分钟。

## 4. 测试数据纪律

- E2E/集成都跑在种子数据上：**不要写死对具体商品名的断言**，用角色选择器（`getByRole`）与种子约定（品牌 `Ox`）。
- 演示品牌在 2026-09 合规化后全部为虚构品牌（`Ox Collection` / `Ox Essentials`），断言里出现 `X Corp` 字样即历史残留。
- 需要新夹具时优先扩展 `prisma/seed.ts` 的幂等分支，而不是在测试里造孤儿数据。

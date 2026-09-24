# 项目分析进度

## 2026-09-23 · Phase 16（完成）

- 完成仓库规模、技术栈、App Router、Prisma、认证、支付、邮件、存储、调度、部署、CI、测试与业务闭环审计。
- 证据：约 68 页面、130 API Route、30 Prisma model、29 migrations。
- 交付报告：`docs/PROJECT_AUDIT_2026-09-23.md`。

## 2026-09-23 · Phase 17 商业交付整改（代码整改完成）

- 已从 main 创建 `chore/commercial-hardening`，基线提交 `df11ed5`。
- 5 名队员按 write_scopes 完成共享任务：资金、退款/分销、安全隐私、商城闭环、运维/测试门禁；队员未自行 commit。
- 已修复：测试库 fail-closed、迁移 reset 门禁、Vitest 4/Vite 6 安全升级、Stripe 游客 token、Session/PI 语义、退款 outbox/重试/幂等、状态 CAS、禁用手工 PAID、COD 分销、规则快照、refresh 重放、日志脱敏、上传 complete/图片验证、SSRF、隐私匿名化/导出、游客预售、优惠券币种、支付死单提示、SUPPORT 消息、到货分页/失败重试、live/readiness、S3 fail-fast、preflight、CI migration/audit/Docker smoke、备份恢复、监控与部署文档。
- 证据门禁：
  - `npm run typecheck`：通过。
  - `npm run lint`：通过，0 error / 13 warning。
  - `npm run test:unit`：23 files / 264 tests 通过。
  - `npm run test:integration`：19 files / 154 tests 通过；每次先确认 `ecommerce_test` 并完整 migrate reset。
  - Playwright E2E：15/15 通过；视觉基线已人工检查后更新 6 张。
  - `npm run build`：通过；修复后 build 不再启动 cron。
  - `npm audit --audit-level=high`：0 vulnerabilities。
  - `preflight` 对开发库按预期 fail-closed（只缺新迁移）；对已迁移 `ecommerce_test` 12/12 通过。
- 备份/恢复演练已在隔离库实测通过：`ecommerce_test` 备份 → 校验 SHA-256 → 恢复到临时库 `ecommerce_restore_test` → `SELECT count(*) FROM users` = 1005 → 清理临时库与产物；期间修复了 Prisma `?schema=` URL、pg_dump/gzip 归档命中和客户端大版本不匹配三类脚本缺陷。
- 生产运行路径已实测：`next start` 生产模式 + 强密钥/S3/Stripe 守卫下 `/healthz`(readiness)、`/api/healthz`(liveness)、`/admin/login` 全部 200；`output: standalone` 产物按 Docker runner 布局组装后 `server.js` 启动，`/healthz`、`/api/healthz`、`/` 全部 200。
- 本机没有 Docker CLI，因此 Docker 镜像 build/start smoke 仍需在 GitHub runner 或部署机执行；真实 Stripe、SMTP/Resend、S3/R2、素材授权、隐私/税务/KYC 属外部上线验收，不得由本地代码绿灯替代。
- 代码整改已提交。

## 并行模型改动集成（用户暂停另一模型后）

- 接收并审查另一模型产生的 17 个未提交 UI/i18n/分销文案改动；funds 与 commerce 队员分别只读复核 task-7/8。
- 修复 4 个高置信问题：游客 token 订单详情被父 layout 提前登录拦截；隐私邮件主题未本地化；admin 深色主按钮 hover 深底深字；真实全额退款/在途错误未本地化。
- 额外修复分销风控“不同订单币种退款直接相加再标 CNY”的错账，改为按订单 `exchangeRate` 快照逐笔折算并在 SQL 聚合。
- 新增游客 token 订单详情 E2E、CNY 风险聚合集成测试和退款错误 i18n 单测。
- 最终验证：typecheck 通过；lint 0 error/13 warning；unit 265/265；integration 155/155；Playwright 16/16；production build 通过。

## 商业化深度硬化 task-9 至 task-12

- Stripe Webhook 新增 `(provider,eventId)` 持久化 claim、5 分钟 lease、FAILED 重试和 PROCESSED/IGNORED 终态；退款按 gateway refund.id 幂等合并，乱序事件不重复记账；调度器仅清理 90 天前已完成事件，FAILED 永久保留供调查。
- 商品缓存失效由 Redis `KEYS` 改为 `SCAN COUNT=200`、分批 `UNLINK`、旧服务端回退 `DEL`，限制循环并保留 TTL 兜底。
- 地址默认项新增每用户部分唯一索引；历史重复自动清理；创建、切换、删除使用 Serializable 事务与有限重试。
- 仪表盘取消全量订单载入 Node 内存，营收/币种/14 天趋势改 PostgreSQL 单次聚合，保留订单汇率快照与逐单 CNY 舍入口径。
- 两个新 migration 已从空测试库完整应用。最终验证：typecheck 通过；lint 0 error/13 warning；unit 274/274；integration 159/159；Playwright 16/16；build 通过；audit 0；test preflight 12/12。

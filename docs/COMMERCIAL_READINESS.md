# 工程级商用就绪度分析（Commercial Readiness）

> 审计时间：2026-02 · 范围：全仓代码 / 部署物 / 测试 / 文档
> 结论先行：**功能完成度高（约 85%），距"可对外收费运营"还差一层工程收尾**。
> 本文档列出差距、优先级与落地动作。

## 1. 已具备的商用能力（无需重做）

| 域 | 现状 |
| --- | --- |
| 交易闭环 | 浏览→加购→结算→支付(Stripe/mock)→发货→退款 全流程；下单事务内原子扣库存防超卖 |
| 认证安全 | JWT httpOnly + Refresh 轮换（重放检测吊销全会话）+ CSRF double-submit + bcrypt(12) + 登录/注册限流 |
| 支付 | Stripe Checkout + Webhook 签名校验 + 幂等消费；未配密钥自动降级模拟支付 |
| 管理端 | RBAC(ADMIN/SUPPORT)：商品/分类/订单/用户/优惠券/评价/退款/审计/设置/CSV 导出 |
| 合规 | GDPR Cookie 横幅、隐私/条款/退款/cookie 政策页、数据删除请求入口、审计日志 |
| 可观测 | pino 结构化日志 + 请求 ID + Sentry 可选接入 + healthz |
| 国际化 | 中英双语 + 9 币种展示（实时汇率，服务端代理缓存） |
| 质量 | Vitest 单元+集成（直连 Handler）、Playwright E2E、ESLint/Prettier、GitHub Actions CI |
| 交付 | Docker 多阶段构建、compose 一键起 PG/Redis/MinIO、Nginx 配置样例 |

## 2. 差距清单（按优先级）

### P0 —— 不修就不能上线收费

| # | 问题 | 动作 |
| --- | --- | --- |
| 1 | **无版本化 Prisma 迁移**：仓库无 `prisma/migrations/`，生产 `migrate deploy` 无历史可放 | 开发机执行一次 `npx prisma migrate dev --name init` 提交迁移目录；CI/生产只跑 `migrate deploy` |
| 2 | **密钥管理**：`.env` 含真实密钥且工作区无 git；生产密钥不能进镜像/compose 明文 | 引入 `.env`（本地）/ secrets manager 或部署平台环境变量；compose 内用 `${VAR}` 引用；轮换 JWT 密钥 |
| 3 | **版本管理缺失**：项目目录不是 git 仓库——无法回滚、无法 CI | `git init` + 首次提交；把 `.env*`、`tsconfig.tsbuildinfo`、`.test-pg-*`、`.mail-out/`、`storage/`、`test-results/` 加入 `.gitignore` |
| 4 | **单点 Postgres**：compose 单机卷，无备份策略即上线 = 数据事故倒计时 | 上线前定备份 cron（`pg_dump` 每日 + 异地存放）；恢复演练一次并记录 SOP |

### P1 —— 上线首月内完成

| # | 问题 | 动作 |
| --- | --- | --- |
| 5 | **SEO 基础**：缺 `sitemap.xml` / `robots.txt` / 商品 JSON-LD 结构化数据 | App Router 加 `app/sitemap.ts`、`app/robots.ts`；详情页注入 Product JSON-LD（名称/价格/库存/评分） |
| 6 | **多币种只展示不结算**：结算固定 CNY，出海即失效 | 接 Stripe 多币种（按币种建 Price）；或明确站内标注"结算币种 CNY" |
| 7 | **图片管线**：首页 Collection 兜底图是 picsum 占位；种子商品图外链 | 运营素材上传走已有 S3/MinIO 后台；兜底图换站内静态图 |
| 8 | **邮件送达**：默认 console 落盘，注册/找回依赖邮件 | 配 Resend 或 SMTP + 发信域名 SPF/DKIM；订单关键节点邮件模板已备 |
| 9 | **订单超时取消靠惰性触发**（读列表时检查过期） | 加定时任务（Vercel Cron / node-cron in worker）扫描过期订单，避免无人访问页面时库存被占 |
| 10 | **限流降级透明度**：Redis 关闭后内存限流仅单实例有效 | 多副本部署必须开 Redis；在 README 部署清单标注为必选项 |

### P2 —— 规模化阶段

| # | 问题 | 动作 |
| --- | --- | --- |
| 11 | 页面全 `force-dynamic`（Header 读会话所致） | 分类页/首页可改 ISR + 客户端个性化区块；或边缘缓存 HTML 片段 |
| 12 | 搜索只有 LIKE 过滤 | 数据量 >5k SKU 时上 PostgreSQL 全文检索或 Meilisearch |
| 13 | 无 APM/慢查询面板 | Sentry Performance + `prisma $extends` 慢查询日志阈值 |
| 14 | 管理端未做设计系统对齐 | 复用本次令牌层（自动继承 0 圆角/黑主色），逐步替换 admin 组件字重 |
| 15 | 评价/晒单无反垃圾 | 接入频率限制 + 首评人工审核开关（admin 设置项） |

## 3. 本次已完成的设计整改（shop.x.com 对齐）

- 设计令牌层重建：白底 `#FFF` / 墨色 `#1C1C1C` / 图底 `#EFEFEF` / 描边 `#DDD` /
  黑铬 `--ink`；`--radius: 0` 且 Tailwind 圆角刻度整体映射归零（历史组件零改动收敛）
- 字体去 webfont 化：系统 Helvetica/Arial 栈，构建不再依赖 Google Fonts 网络
- 黑头黑脚：顶栏含分类导航（桌面 inline / 移动横滚）、页脚居中排布
- 组件语言统一：黑底直角按钮、扫入式描边按钮（`.btn-sweep`）、划线链接
  （`.link-underline`）、透明度层级替代灰阶文字
- 页面整改：双 Collection 横幅首页、黑色横幅列表页、65/35 详情页、
  方角抽屉/弹层
- QA 工具链：`scripts/design-assertions.cjs`（DOM 断言 9/9 通过）+
  `scripts/design-vision-qa.cjs`（GLM 视觉模型四页审阅通过）

## 4. 上线检查单（浓缩版）

```bash
git init && git add -A && git commit            # 0. 版本管理
npx prisma migrate dev --name init              # 1. 固化迁移
openssl rand -base64 48                          # 2. 轮换 JWT_ACCESS/REFRESH_SECRET
# 3. SITE_URL=https://… STRIPE_* MAIL=… S3=… 注入部署平台
# 4. pg_dump 定时备份 + 恢复演练
# 5. sitemap/robots/JSON-LD（P1 #5）
```

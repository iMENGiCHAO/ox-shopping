# Findings

## 项目现状（2026-02 会话审计）

### 功能盘点（完整度高）
- Next.js 14 App Router + TS strict + React 18；Tailwind + shadcn/ui（Radix）
- PostgreSQL 16 + Prisma；Redis 缓存/限流（可降级内存）
- 自建 JWT（jose）httpOnly Cookie + Refresh 轮换 + CSRF double-submit
- 支付 Stripe Checkout + Webhook 幂等；未配置时 mock 支付全流程可跑
- 邮件 Resend/SMTP/console 落盘；S3 兼容存储 + 本地盘降级
- 中英文 i18n（shop-i18n / admin-i18n）；9 币种实时汇率显示（结算仍 CNY）
- 管理端 RBAC（ADMIN/SUPPORT）：仪表盘/商品/分类/订单/用户/优惠券/评价/退款/审计/设置
- 测试三层：Vitest 单元 + 集成（直连 Route Handler）+ Playwright E2E
- Docker 多阶段 + compose（PG/Redis/MinIO）+ Nginx 配置 + GitHub Actions CI
- 发票 PDF（pdfkit+Noto CJK）、GDPR cookie 横幅、政策页、数据删除请求

### 设计漂移（核心发现）
- docs/DESIGN.md 记录的是 shop.x.com 黑白极简 0 圆角规范，
  但当前代码是 "Apple-inspired"：#0071E3 蓝、rounded-2xl、Sora/Inter 字体、渐变 hero
- README 第 19-22 行宣称黑白极简风 —— 与代码不符（文档先行、代码回退或半途切换）
- 用户明确要求回到 shop.x.com 风格 → 本次整改 = 对齐 DESIGN.md 规范并落地到代码

### 商用差距（工程级）
1. 无 prisma/migrations 版本化迁移目录（开发靠 db push，生产 migrate deploy 无历史可部署）
2. tsconfig.tsbuildinfo（2.4MB）应入 .gitignore；.test-pg-data/.test-postgres 等 PG 数据目录不应留在仓库工作区
3. 工作区不是 git 仓库（无 git log 输出）——需要初始化版本管理
4. Header 缺少分类导航（商城可用性问题）；首页 hero 无商品视觉锚点
5. SEO：待确认 sitemap.xml / robots / 结构化数据（JSON-LD）
6. 图片 picsum 占位（首页 collection banner fallback）需替换为真实素材管线
7. 结算币种固定 CNY（多币种仅展示）——出海需接多币种收单
8. 单机 docker-compose 部署可用但非高可用；缺备份策略文档化（README 有 pg_dump 提示）

## 关键文件地图
- 设计令牌：src/app/globals.css、tailwind.config.ts、src/app/layout.tsx（字体）
- 基础件：src/components/ui/{button,input,badge,pagination,empty-state,status-badge,...}
- 商城壳：header/header-shell/footer/cart-drawer/search-overlay/currency-select/user-menu/lang-provider
- 商品流：product-card/product-grid/gallery/buy-panel/add-to-cart-button/buy-now-button/quick-add-button/quantity-input/favorite-button
- 页面：app/(shop)/{page,products,products/[slug],cart,checkout,orders,account,auth,policies}
- 服务层：server/services/{product,cart,order,settings,stats}.service.ts

# 项目详细开发文档 — Ox Shopping (牛来购物)

> 最后更新：2026-08 · 覆盖迭代范围：commit `e620d1c` → `4d97e6f`
> 定位：面向欧美客户的跨境电商独立站，1:1 复刻 shop.x.com 视觉与交互的 SpaceXAI Shop 演进版（现品牌为 **Ox Shopping / 牛来购物**）。

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| 业务定位 | 官方商店克隆站：商品列表/详情、购物车、结算（Mock）、订单、会员、多币种、中英双语言 |
| 技术栈 | Next.js 14 (App Router) · TypeScript strict · Prisma + PostgreSQL 17 · Tailwind CSS · Radix UI · zod · vitest · Redis(分类树缓存) |
| 运行模式 | `npm run dev`（本地开发）/ `next build && next start`（生产，受 REQUIRE_STRONG_SECRETS 密钥守卫保护） |
| 数据层 | PostgreSQL 17（Homebrew），`scripts/start-db.sh` 含 GCD workq 豁免 dylib 启动链路 |
| 支付 | **预留态**：前台结算走 Mock；Stripe 代码保留，后台 `/admin/payments` 可填四网关凭证待接入 |
| 品牌 | 前台英文 `Ox Shopping`；后台中文 `牛来购物`；站名存 `site_settings.siteName` |

### 关键目录

```
src/app/(shop)/            前台（商品/列表/搜索/政策/账号/结算）
src/app/admin/             后台管理（products/orders/banners/legal/payments/settings/…）
src/app/api/               所有 API 路由（middleware 做 CSRF double-submit + 会话）
src/components/shop/       前台组件（header/footer/buy-panel/gallery/currency-*）
src/components/admin/      后台组件（admin-shell/product-form/currency-manager/…）
src/server/services/       服务层（product/order/settings/spec-stock/payment-log/…）
src/lib/                   工具与常量（i18n、validations、storage、csrf、audit、policy-defaults）
prisma/                    schema + seed + xcom-catalog 商品目录
scripts/                   start-db / i18n 审计 / 备份 / 压测等运维脚本
docs/                      本文档及验收/审计/运行手册
```

---

## 2. 本次迭代交付清单（e620d1c → 4d97e6f）

### 2.1 横幅与落地页大横幅（对齐官方双入口结构）

- **新增 `Category.bannerImage`**（`prisma/schema.prisma`，db push 已执行）：集合落地页顶部全宽横幅与列表卡片图彻底分离。
- 全链路打通：`categoryCreateSchema.bannerImage`（validations）→ `AdminCategory.bannerImage`（admin types）→ 分类编辑表单（schema/reset/payload/UI 上传器）→ `product.service.CategoryNode.bannerImage` → 落地页 `products/page.tsx` hero 优先 `bannerImage || image`（3.49:1，`[ Name ]` 左下角标题，与官方一致）。
- **横幅管理页 `/admin/banners`** 每槽位双上传口：
  - ① 首页入口图（半宽 16:9，1200×675）
  - ② 落地页大横幅（全宽 3490×1000）——保存时按 `slot.href` 的 `category=` 参数解析目标分类并 `PUT /api/admin/categories/[id]` 写入 `bannerImage`；无 href 时回落第 index 个顶级分类。
- 首页两横幅仅由 `pageBanners.homeLeft/homeRight` 驱动（`settings.service.getPageBanners`）。

### 2.2 库存一致性（供应链数据打通，本轮核心）

问题背景：多规格（颜色/尺码）商品此前**没有各规格库存数字的后台维护入口**，前台售罄判定、下单扣减用的 `specStock` 与整件 `stock` 互相独立，构成数据孤岛。

- **后台商品表单规格库存编辑器泛化**：从"只认 Size 组"改为**所有可选组各自维护**（Color/Size 一视同仁），每组每值一个数字输入框，0=售罄，留空=不追踪。
- **统一口径 `aggregateTrackedStock(specStock)`**（`src/server/services/spec-stock.ts` 纯函数）：
  - `整件 stock = min(各组 Σ)`——任一维度的池都是可售上限，Color×Size 任意组合都不会超卖，与下单扣减 `planSpecDeduction`（每维度独立池、逐选中值扣减）口径一致。
  - 表单内实时联动 `stock` 输入框；`PUT/POST /api/admin/products*` **服务端兜底**强制同步（API 直调也无法漂移）。
- 演示数据：预售 T 恤 `unisex-retro-x-com-short-sleeve-tee-pre-sale`（Color 25/18，Size 6/8/9/7/5/4/0）、连帽衫 `unisex-3d-x-logo-hoodie`（Color 12/7/0，Size …）均已入库。
- 单测新增 4 例（单组和/多组 min/全 0/空映射），共 69 例全绿。

### 2.3 预售商品（Pre-order）语义修正

- **预售商品规格不再因库存 0 被禁选**：PDP `effectiveSelectable` 在 `isPresale` 时清空 `soldOutValues`（预订语义：可任选颜色/尺码下单），"Pre-order item — ships within 14 days of payment" 提示保留；Add to Cart 可用。
- 下单侧预售逻辑原本正确：允许 0 库存下单、只扣实际可扣部分（下限 0）、取消时精确回补（杜绝凭空造库存）。
- **后台订单新增"仅预售"筛选**：`/api/admin/orders?presale=true` → `where.items = { some: { product: { isPresale: true } } }`，UI 为筛选栏 checkbox。

### 2.4 法务页面独立编辑器

- 新增 `/admin/legal`：五份文档（Accessibility/Privacy/Terms/Refund/Cookies）Tabs 独立编辑，支持轻量 Markdown，保存 `PUT /api/admin/legal`（增量 upsert + 审计 `SETTINGS_UPDATE` scope=legal-pages）。
- **修复优先级 bug**：`getPolicyText` 原先"内置默认 > 后台自定义"，导致保存不生效——现为 **后台自定义(当前语言) > 自定义(另一语言) > 内置默认**，保存即时生效（实测 `/policies/privacy` 秒级更新）。
- `accessibility` 政策并入 `policy-defaults.ts` + `settings.service.policies`；`/pages/accessibility-statement` 改为读设置渲染。
- 后台"设置"页移除 Policy 卡片（职责收敛到 /admin/legal）。

### 2.5 前台细节对齐官方

| 项 | 实现 |
|---|---|
| Header 登录态 | 固定显示 **Account**（不渲染用户名，防长名撑破布局）；用户名移入下拉 label `name · email` |
| 售罄颜色圆圈 | 官方反斜杠样式：`w-[42px] h-[1.5px] rotate-45` 绝对定位居中，**两端出头 ~4.7px**（实测 line 43.5px / 圆 r 17px）；整件售罄也全画线；售罄值禁点 |
| 规格下拉 | 原生 select → **Radix Select**：`position="popper"` + `w-[var(--radix-select-trigger-width)]`，与触发器**同宽、正下方紧贴**（实测 dx=0、宽 320=320）；售罄项 disabled |
| footer 法务链接 | 移除焦点方框（`focus-visible:[outline:none]` 等），保留键盘下划线 |
| footer 货币下拉 | 新增 `direction="up"`，黑底页脚**向上展开**，杜绝向下露白 |
| PDP 顶部间距 | json-ld `<script>` 从 `space-y-14` 容器内移出（消除 56px 隐性 margin）；最终按**官方实测 48px**（shop.x.com 1440px 视口：header 65px、首图距 header 48px）定为 `pt-12` |

### 2.6 搜索页对齐官方

- **桌面端 Availability 官方式筛选按钮**：点击立即切换 `in_stock=1`，选中态黑底白字 chip（"Availability · In stock only ✓"），**无下拉菜单**；移动端保留 Filters 抽屉。
- **Price 弹层**（桌面端独立，min/max + View results）。
- **Pages 搜索增强**：静态页注册表含中英标题/关键词子串匹配 + **FAQ 内容检索**（question/answer contains，命中带答案摘要卡片）；中文"退款"可搜出 FAQ/政策页。
- `in_stock` 参数真实消费（`listProducts({inStockOnly})`），标题计数同步。

### 2.7 品牌与 LOGO 系统

- **后台"品牌 LOGO"上传卡**（`/admin/settings`）：ImageUploader + URL 双方式、亮/暗双预览、保存写 `site_settings.siteLogoUrl`、前台顶栏即时生效。
- **LOGO 资产**（`public/images/brand/`）：
  - `logo-header.png` — **透明底白色图案**（Canvas 逐像素反色 `RGB=255-v`、alpha 原样保留；实测 luminance 254 适配黑底，反色前后不透明像素数一致无损失），header 直出 h=34px；
  - `favicon.png` — **透明底黑色图案**（原始图，luminance 0 适配浅色标签栏），`layout.tsx` icons/icon+apple 指向；
  - `logo.png` — 原始全尺寸备份。
- **品牌字眼全量替换**：`SpaceXAI Shop / SpaceXAI / MENG Shop / MENG` → **Ox Shopping**（14 个源码文件 + DB：layout metadata、邮件标题、发票、MAIL_FROM、i18n 键值、admin login）；分类 `spacexai-collection` 显示名 → **Ox Collection**，首页右横幅标题同步；`xAI`（商品名）按产品语义保留。站名：`牛来购物 / Ox Shopping`。

### 2.8 支付接口预留（/admin/payments）

- 四网关注册表 `src/lib/payment-gateways.ts`：Stripe / 支付宝 / 微信支付 / PayPal，各自启用开关 + 凭证字段。
- `GET/PUT /api/admin/payment-settings`：
  - **密钥脱敏**：保存后返回 `••••尾4`，明文不出后端；
  - **空串/掩码 = 保留旧值**（不覆盖已存密钥）；
  - 非法币种/键忽略；写审计 `PAYMENT_SETTINGS_UPDATE`。
- 说明卡明示：当前结算 Mock，凭证就绪启用后接入 provider 即切换真实收款。
- 工程约束：Next route 文件只允许导出 HTTP 方法 → 网关注册表独立成模块（过 Next 类型检查）。

### 2.9 后台货币统一管理

- 设置页新增「货币与汇率」卡（`src/components/admin/currency-manager.tsx`）：
  - 9 币种汇率快照表（来源 live/db/static + 更新时间）；
  - **一键刷新**（`POST /api/admin/currency/refresh`：绕缓存直拉 open.er-api.com 并落库）；
  - **手动覆写**（`PUT /api/admin/currency` → `site_settings.fx.overrides`，**优先于自动汇率、跨刷新持久、非法币种忽略**）。
- `currency-server.ts` 新增 `loadOverrides/saveOverrides/invalidateRateCache/forceRefreshRates`；`refresh()` 链路合并覆写。
- 实测：覆写 CNY=7.25 → live 刷新后仍 7.25（不被上游 6.73 冲掉）。

### 2.10 安全与管理

- **后台硬门禁**：`/api/auth/login` 支持 `scope:"admin"`——非 ADMIN/SUPPORT 角色**直接 403「该账号没有后台访问权限」**，不建立任何 session，审计 `AUTH_ADMIN_DENIED`；admin 登录页统一携带 scope。layout 守卫（role 校验 + redirect）与 API `requireStaff/requireAdmin` 双保险，**前台注册的顾客账号无法进入后台**。
- **管理端导航重构**：Users / Audit Logs 入口自侧边栏移至**顶栏圆形图标按钮组**（与 FAQ 入口同款 h-8 w-8、激活态黑底白字，仅 ADMIN 可见）；侧边栏保留业务导航。
- 前台固定 `getLang()="en"`（`shop-i18n-server.ts`），后台锁定中文——中英隔离，杜绝混用。

---

## 3. 关键决策记录（ADR 简表）

| # | 决策 | 理由 |
|---|---|---|
| 1 | 规格库存每维度独立池，`stock=min(Σ各组)` | 与下单扣减口径一致；任一维度是上限，杜绝 Color×Size 组合超卖 |
| 2 | 整件库存同步放**服务端兜底**（非仅前端） | API 直调也无法造成两处数字漂移；单测覆盖 |
| 3 | 密钥存 DB 但 API 返回脱敏 + 空串保留 | 满足"后台直接填支付凭证"需求，同时避免明文回显；生产建议密钥走 .env 的提示保留 |
| 4 | 支付保持 Mock 预留 | 用户明确要求接口预留、不接真实支付；Stripe 代码保留 |
| 5 | PDP 间距以官方实测 48px 为准 | 用户三次反馈（68 开/12 紧/32 中）后官网可访问，直接实测取真值，不再凭感觉 |
| 6 | 前台强制英文、后台强制中文 | 官方为英文站（欧美客群）；后台中文运营效率；`shop-lang` cookie 不再参与 |
| 7 | LOGO 反色用 Canvas 逐像素（Playwright） | 环境无 PIL；alpha 保真、颜色可控，实测无损失 |
| 8 | route 文件不导出业务常量 | Next App Router 对 route 导出白名单强校验，独立模块 `lib/payment-gateways.ts` |

---

## 4. 验证体系与质量门

- `npx tsc --noEmit` — **0 错误**（全迭代保持）。
- `npm run test`（vitest）— **69/69 通过**（含 `aggregateTrackedStock` 4 例新增）。
- `node scripts/i18n-audit.mjs` — **0 缺失**（admin-i18n 全词条覆盖，含本轮新增约 40 条）。
- Playwright DOM/几何断言（临时脚本，不入库）：售罄斜线出头 4.7px、下拉 dx=0 同宽、政策即时生效、specStock minΣ 联动、403 门禁、密钥脱敏、LOGO 亮度、官方 48px 对比。
- curl API 全链路：CSRF(double-submit) → 登录 → 管理 API 读写。

**开发期已知事项**：
- dev server 长时间运行后客户端水合可能失效（页面 SSR 正常但交互不响应）——重启 + `rm -rf .next` 即恢复；上线必须生产构建。
- 生产启动受 `REQUIRE_STRONG_SECRETS` 密钥守卫保护（设计行为）：`next start` 前需配置 ≥32 位随机 JWT 密钥，或本地演示显式 `REQUIRE_STRONG_SECRETS=false`。
- 本机 SIP 关闭（Custom Configuration），PG 需 `scripts/start-db.sh`（GCD workq 自检豁免 dylib）启动；建议后续重开 SIP。
- 曾发生验证脚本误触演示数据（DELETE/PUT）→ 已按 seed 基线核对恢复；**自动化操作后台需只走 API 直连**。

---

## 5. 遗留与建议（按优先级）

1. **真实支付接入**：凭证在 `/admin/payments` 就绪后，将 Stripe Checkout / 支付宝 / 微信 provider 接到结算路由（当前 Mock 分支处），并打通 webhook 验签（`/api/webhooks/stripe` 已存在）。
2. **PDP 图册**：官方首图为 4 张候选（大图+缩略图+轮播），当前 Gallery 缩略图列逻辑已就绪，可继续对齐灯箱/放大镜细节。
3. **生产部署**：JWT 密钥、Stripe 密钥、S3 存储驱动、邮件服务均走 .env；`next build && next start` 前先过密钥守卫；多实例运行见 `docs/RUNBOOK-multi-instance.md`。
4. **汇率上游**：open.er-api.com 免费源日更一次，商用建议切换付费/自建源（`currency-server.ts` RATE_API 一处配置）。
5. **旧数据目录**：老 ecommerce datadir 从未找到（集群 8-21 后为空），当前目录为重建演示数据；如用户找到旧 datadir 可恢复。
6. **i18n 前台**：词典已 100% 覆盖，但 `getLang` 固定 en——若未来需要 zh 前台，恢复 cookie/浏览器语言逻辑即可（词典已备）。

# 项目详细开发文档 — Ox Shopping (牛来购物)

> 最后更新：2026-09-20 · 覆盖范围：**整个会话窗口**（早期历史见 §2.0，近期迭代 §2.1–2.14）
> 近期迭代 commit 范围：`e620d1c` → `1a83385`（Phase 13 收口；B-2 找回密码尚在工作区未提交）
> 定位：面向欧美客户的跨境电商独立站，1:1 复刻 上游参考站 视觉与交互的 Ox Shop 演进版（现品牌为 **Ox Shopping / 牛来购物**）。
>
> **本文档已同步至 2026-09-20（含 Phase 12 账户注销闭环、Phase 13 上游参考站 照搬、B-2 原站式找回密码）。**

---

## 1. 项目概览

| 项 | 值 |
|---|---|
| 业务定位 | 官方商店克隆站：商品列表/详情、购物车（含游客车）、结算（Mock / Stripe）、订单、会员、多币种、中英双语言、账户注销 |
| 技术栈 | Next.js 16.3.3 (App Router + Turbopack + `src/proxy.ts`) · TypeScript strict · Prisma 5.22 + PostgreSQL · Tailwind CSS · Radix UI · zod · vitest · Redis(可选，缓存/限流) |
| 运行模式 | `npm run dev`（本地开发）/ `next build && next start`（生产，受 REQUIRE_STRONG_SECRETS 密钥守卫保护） |
| 数据层 | 本地 dev 用 `scripts/start-db.sh`（Homebrew @17 + GCD workq 豁免 dylib）；macOS 15.7+ 需先跑 `scripts/fix-postgres-multithreaded.sh` 打二进制补丁。（原 embedded-postgres 遗留脚本已在 2026-09-26 死代码清扫中删除） |
| 支付 | 六渠道三态（未配置/已配置/可收款）：mock 开箱启用；Stripe 渠道化真实接入（后台 `/admin/payment-channels` 填 `sk_`/`whsec_` 即收款）；alipay/wechat/bankcard/paypal 为预留级；渠道×币种校验（国内渠道仅 CNY） |
| 品牌 | 前台英文 `Ox Shopping`；后台中文 `牛来购物`；站名存 `site_settings.siteName` |

### 关键目录

```
src/app/(shop)/            前台（商品/集合/搜索/政策/账号）
src/app/(checkout)/        结账与强制改密独立外壳（无店铺页头页脚）
src/app/admin/             后台管理（products/orders/coupons/payment-channels/password-resets/…）
src/app/api/               所有 API 路由（proxy.ts 做 CSRF double-submit + 会话）
src/components/shop/       前台组件（header/footer/buy-panel/gallery/currency-*）
src/components/admin/      后台组件（admin-shell/product-form/currency-manager/…）
src/server/services/       服务层（product/order/settings/spec-stock/password-reset/…）
src/lib/                   工具与常量（i18n、validations、storage、csrf、audit、guest-cart、auth/temp-password）
prisma/                    schema + seed + xcom-catalog 商品目录 + migrations
scripts/                   fix-postgres-multithreaded / restart-dev / start-db / qa/* 等运维与验收脚本（2026-09-26 死代码清扫：删除 32 个被 Playwright e2e 与集成测试取代的早期 QA 脚本及遗留一次性脚本）
docs/                      本文档及速查/部署/清单/设计文档
```

---

## 2. 早期历史与项目基线（checkpoint 前）

本窗口更早阶段的完整记录（决策、教训、既有功能）：

### 2.0.1 数据库恢复事件（机器级故障，非数据损坏）

- **症状**：PG 拒绝启动（`fork()` 后 `pthread_is_threaded_np` 断言 / workq 线程注入），曾被误判为"数据被我改崩"。
- **根因**：本机 SIP 关闭（Custom Configuration）+ Homebrew initdb 的 PG17 对"主线程 fork"做自检；`pg_controldata` 证明数据完好。
- **解法**：`/tmp/libnoforkcheck.dylib` —— 官方 `__DATA,__interpose` 段结构体 `{repl, orig}` 拦截 `pthread_is_threaded_np` 返回 0；`scripts/start-db.sh`（commit `1519664`）固化该启动链路（clang 缺则重编译）。
- **遗留**：SIP 仍关闭（建议恢复模式重开）；旧 ecommerce datadir 从未找到（集群 8-21 后为空），当前为重建演示目录，若用户找到旧 datadir 可恢复。

### 2.0.2 商业优化规划（P0–P2）与既有文档

- 现存文档：`PRODUCTION_CHECKLIST.md`、`DESIGN.md`、`PRODUCTION_DEPLOY_2026.md`、`QUICKSTART_2026-09.md`（历史审计/会话文档已归档清理）。
- 已落地的基础设施（早于本迭代，仍在使用）：
  - **备份脚本**、**速率限制**（login/API 等）、**降级策略**（DB 故障回落内置默认，站点不 500）、**GDPR 数据导出**、**i18n 100% 覆盖**（audit 脚本守护）、**PaymentLog 支付审计**、**CSP nonce**、**负载测试工具**、**多实例运行手册**。

### 2.0.3 PDP 对齐官方（e620d1c，早于本迭代）

- 移除 **Buy Now** 按钮：有货仅 "Add To Cart"，售罄仅 "Notify me"，预售保留 Pre-order 提示（Playwright 三商品验证：beanie / rugby-shirt / dad-hat）。

### 2.0.4 横幅管理重构（d606ed8，早于本迭代）

- 移除 `collectionsFallbackImage`（schema/API/UI 三处）：首页横幅完全由 `homeLeft/homeRight` 驱动，`pageBanners` 单键配置。
- ⚠️ **该方案已在本迭代内被 6d3eb48 取代**：`pageBanners` / `getPageBanners` / 独立页 `/admin/banners` 全部删除，首页横幅改由 `Category.homeSortOrder` + `Category.bannerImage` 驱动（现行口径见 §2.1 末尾的修正说明）。

### 2.0.5 既有功能全景（本窗口内未大改，仍在线）

- 前台：登录/注册（邮箱验证）、购物车（规格选择快照 + 游客本地车）、结算（Mock / Stripe 渠道）、订单状态机与退款、到货通知（Notify me，按规格匹配回货）、多币种（9 币种 + 汇率缓存/单飞/SWR）、搜索（Sort by/Price/Availability/Pages tab）、政策与 FAQ 页、尺寸对照表、灯箱/放大镜。**忘记密码已从「邮件自助重置」改为后台人工审批 + 临时密码（见 §2.13）；游客免登录结账见 §2.12。**
- 后台：Dashboard、商品/分类（含首页横幅次序与横幅图）/法务/货币/支付渠道/物流/优惠券/找回密码管理、订单（筛选/导出 CSV/详情抽屉）、退款、到货通知、用户、审计日志、设置；角色 ADMIN/SUPPORT，API 统一 `requireStaff/requireAdmin`。

## 2. 本次迭代交付清单（e620d1c → 1a83385，含 Phase 12/13 与 B-2）

### 2.1 横幅与落地页大横幅（对齐官方双入口结构）

- **新增 `Category.bannerImage`**（`prisma/schema.prisma`，db push 已执行）：集合落地页顶部全宽横幅与列表卡片图彻底分离。
- 全链路打通：`categoryCreateSchema.bannerImage`（validations）→ `AdminCategory.bannerImage`（admin types）→ 分类编辑表单（schema/reset/payload/UI 上传器）→ `product.service.CategoryNode.bannerImage` → 落地页 `products/page.tsx` hero 优先 `bannerImage || image`（3.49:1，`[ Name ]` 左下角标题，与官方一致）。
- **横幅管理入口（现行口径，以此为准）**：独立页 `/admin/banners` 与其 `pageBanners` 单键配置曾在早期提交中使用，但已在 **6d3eb48（本迭代内）整体移除**：
  - 首页两块横幅 = `Category` 中 `homeSortOrder != null` 的集合按该值排序取前两块（`src/app/(shop)/page.tsx`），1=左、2=右。
  - 出图 = `Category.bannerImage || Category.image`；集合落地页 hero 同为 3.49:1 全宽。
  - 编辑入口 = `/admin/categories` 分类弹窗（`homeSortOrder` + `bannerImage` 上传器），经 `POST/PUT /api/admin/categories*` 持久化。

### 2.2 库存一致性（供应链数据打通 → 2026-09-30 组合粒度全链路统一，本轮核心）

问题背景：多规格（颜色/尺码）商品的库存数据曾有三套互相独立的口径（整件 `stock`、
维度池 `specStock`、组合 `ProductVariant`），构成数据孤岛。**2026-09-30 大爷定稿
业务模型（全站唯一口径）**：

> **第一个添加的可选属性组 = 父组，后面添加的都是子组；有子组的父组不能手写库存
> （恒等于其名下子组规格之和）；商品总库存 = 全部组合之和（服务端重算）；单规格
> 商品才直接填总库存。全程不硬编码任何属性名**——任何属性当父组都走同一逻辑。

- **数据模型**：库存真相在 `ProductVariant`（组合粒度，`signature` 规范化键 =
  `server/services/variant-stock.ts` 纯函数，前后端共用）；`specStock` 维度池废止
  （仅存量商品保留，保存一次即收敛为组合粒度，数字守恒）。
- **商品编辑表单**：属性行带父组/子组徽标（按添加顺序动态判定）；父组卡片右侧
  「库存合计」只读；子组规格横排小单元逐格录入；总库存实时联动只读。
- **商品管理大表**：库存列统一「组合矩阵弹层」——不点显示总库存（悬浮可见各父组
  合计与子组明细），点铅笔弹出矩阵（多属性组按父组取值分卡片、单属性组平铺）。
  数据源并集（属性可选组 ∪ variants 组/值 ∪ specStock 存量键，存量全兼容）；
  预填：组合数据 → 维度池每组合取最小值（保守）→ 全 0 待补录。
- **服务端兜底**（`PUT/POST /api/admin/products*`）：有组合 → `stock` 强制 = Σ
  组合；删光组合回落 specStock 汇总 → `input.stock` → 原库存；`PATCH /stock`
  守卫拒绝对有组合/可选属性组商品直改总库存（孤立 specStock 不拦）。
- **购物车/下单/回补/到货通知全链路按组合粒度**：加购校验 `variantAvailableQuantity`
  （组合不存在/售罄在加购入口就拦）；下单扣减 `planVariantDeduction`；取消回补按
  `{ variantId, qty }` 凭据精确回补；到货通知按 `findVariant` 组合定位（组合回货
  才通知该客户，登记守卫同步支持组合粒度）。
- 2026-09-30 全链路排查修复 5 个真 bug（详见 CHANGELOG）：selectable 不落库 /
  购物车没接变体 / 到货通知对组合商品断裂 / 大表与表单数据打架 / 直改守卫漏判。
- 单测：`tests/unit/spec-stock.test.ts`（维度池存量兼容）+ `tests/unit/variant-stock.test.ts`
  （组合粒度：签名/定位/扣减计划/可选组推导/可售量）；集成
  `tests/integration/spec-stock-consistency.test.ts`（跨入口守恒）。

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
| PDP 顶部间距 | json-ld `<script>` 从 `space-y-14` 容器内移出（消除 56px 隐性 margin）；最终按**官方实测 48px**（上游参考站 1440px 视口：header 65px、首图距 header 48px）定为 `pt-12` |

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
- **品牌字眼全量替换**：`Ox Shop / SpaceXAI / MENG Shop / MENG` → **Ox Shopping**（14 个源码文件 + DB：layout metadata、邮件标题、发票、MAIL_FROM、i18n 键值、admin login）；分类 `spacexai-collection` 显示名 → **Ox Collection**，首页右横幅标题同步；`xAI`（商品名）按产品语义保留。站名：`牛来购物 / Ox Shopping`。

### 2.8 支付接口预留（/admin/payments）— 已被 Phase 10 渠道化取代

> ⚠️ 本节描述的是**早期实现**（`/admin/payments` 页 + `/api/admin/payment-settings` + 四网关 `payment-gateways.ts`）。
> 现行实现是 **`PaymentChannel` 数据表 + `/admin/payment-channels` + `/api/admin/payment-channels` + 六渠道三态**，
> 见 §2.14 与 `docs/payment-channels.md`；下文仅作历史沿革参考。

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
- 前台语言：`src/lib/shop-i18n-server.ts: getLang()` 优先级 = 币种 cookie（CNY→zh，其余→en）> 路由前缀（`proxy.ts` 注入 `x-lang`，`/zh` / `/en`，无前缀=英文）> lang cookie > 默认 `en`；后台锁定中文——中英隔离，杜绝混用。

### 2.11 Phase 12：账户注销闭环（2026-09-17）

背景：大爷指出「账户删除功能跟后台管理没有衔接好」。摸底实锤——注销申请提交后只写审计日志 + 发确认邮件，admin 端零衔接（无通知/无筛选/无处理入口），是全站唯一半假功能；顺带全站复查其余能力均为真实闭环。**为什么必须闭环**：注销是个**人可撤回、可审计、有等待期**的申请流程，只发邮件会让「谁在处理、处理到哪一步」彻底丢失。

- **数据模型**：`User.deletionRequestedAt`（有值=申请处理中；处理完成/驳回后清空），迁移 `prisma/migrations/20260917095720_user_deletion_request`。
- **用户端**：`POST /api/user/deletion-request` 提交（重复提交 409 + 审计 + 双语确认邮件 + `notifyAdmins` 站内通知，link=`/admin/users`）；`DELETE` 同路由自助撤回（无在途 409，审计 `DATA_DELETION_CANCEL`）；`/api/auth/me` 返回 `deletionRequestedAt`，`/account/profile` 注销卡条件渲染（在途→红框状态卡 + 撤回按钮，隐藏提交入口防重复）。
- **后台处理端**：新增 `POST /api/admin/users/[id]/deletion`——`approve` 先向**原邮箱**发 `account-deleted` 确认邮件（匿名化后不可送达），再匿名化 `email=deleted-{id}@invalid.local`、`name=已注销用户`、`status=DISABLED`、`emailVerified=false`，并 `revokeAllUserTokens` 吊销全部会话；`reject` 清空申请字段 + `deletion-rejected` 邮件（备注可选随邮件）+ 双审计，账户字段不动。护栏：admin 不能处理自己的申请（400）、无在途申请处理 400。
- **后台列表**：`/admin/users` 新增「注销申请中」筛选 + 行内红徽标 + 详情申请日期 + 处理动作块（驳回备注 Textarea + 确认/驳回双按钮）。
- **B-1 后台直接删除**（2026-09-20 补）：`DELETE /api/admin/users/[id]` 复用 approve 的匿名化语义（发信→匿名化→停用→吊销会话→审计 `ADMIN_USER_DELETE`），护栏为不能删自己、不能删最后一个 ADMIN、已注销账号幂等拒绝。

### 2.12 Phase 13：上游参考站 样式与功能完整照搬（2026-09-20）

方法：Playwright 直连 上游参考站 取真实几何/计算样式，与本机同视口逐项对比，差异一律以**原站实测值**为准。以下只列结构性变更，纯视觉微调见 CHANGELOG 2026-09-20。

- **页脚**：店铺页脚 7 条（含 `Your Privacy Choices` → `/pages/data-sharing-opt-out`、`Terms` 走 `/pages/terms-and-conditions`、`Cookie Consent` 改「重新唤起同意横幅」语义）；checkout 页脚 3 条（Refund policy · Privacy policy · Cookies）。新建 `/pages/terms-and-conditions`（内容取后台可编辑法务）。
  > 2026-09-20 修正：曾以「原站只有 6 条」为由删掉 `Your Privacy Choices`。该结论来自
  > 「导出 `<footer>` 内全部 `<a>`」——原站这条**不在 `<footer>` 元素内**，所以漏了。
  > 三条独立通道（r.jina.ai DOM 文本 / 原站 375 整页图 4-2-1 折行 / 原站 1200 单行 7 段墨迹）
  > 一致证实是 7 条，已恢复。
- **PLP 重构**：抽 `src/components/shop/collections-index.tsx` / `collection-listing.tsx` 共享组件；`/products` 与 `/collections` 同为 **All collections 索引**；新增 `/collections/[slug]` 集合页；旧链接 `/products?category=<slug>` 由 `src/proxy.ts` 307 迁移到 `/collections/<slug>`（保留 `/zh`/`/en` 前缀，避免中文用户被甩到英文站）。
- **游客结账/游客支付**：新增 `src/lib/guest-cart.ts`（localStorage `guest_cart` 公共模块）与公开接口 `GET /api/cart/preview?ids=`；checkout-flow 按登录态分流。修掉一个真 bug——游客下单后跳模拟支付页**没带 orderToken** 导致 mock-pay 403、页面静默卡在 Processing、订单永不 PAID；现把 `orderToken` 附加到 paymentUrl，全链路（下单 `userId=null` + `contactEmail` + `accessToken` → 带 token 支付 → PAID → 凭 token 查单 200 / 无 token 403）实测通过。
- **后台配套**：`POST /api/admin/products/batch-delete` 商品批量删除；上传图片按用途归档 `uploads/{categories|products|brand|misc}/年/月/`（`src/lib/storage/index.ts`，本地与 S3 同结构，未知用途收敛为 `misc` 防路径注入）；分类弹窗三字段 3 列同排对齐。
- **测试基建**：E2E 固定测试商品 + 测试末尾还原库存（修复测试侵蚀生产数据）；视觉基线 5 张重拍（页脚/PLP/集合索引变化）。

### 2.13 B-2：原站式找回密码（人工审批 + 首登强制改密，2026-09-19/20）

原站式找回密码在本项目落地为**人工审批闭环**（`password-reset.service.ts` 注释即「B-2 原站式人工审批流」），而**不是**「邮箱即凭证」的自动重置——自动重置无法拦截被入侵邮箱，人工审批可凭申请说明甄别身份。

- **数据模型**：`PasswordResetRequest`（`status` `PENDING/APPROVED/REJECTED`、`email` 快照、`note`、`handledById`/`handledAt`、`rejectReason`、`ip`）+ `User.mustChangePassword` / `User.passwordChangedAt`；迁移 `prisma/migrations/20260919233506_password_reset_requests`。**为什么落库而不只发邮件**：人工审批必须有可查询、可幂等、可审计的状态载体。
- **申请**：`POST /api/auth/forgot-password` 防枚举（邮箱不存在/停用/注销中/已有在途申请一律同一句回执）+ 限流双保险（单 IP 3/min、单邮箱 3/h）；落库 PENDING 后 `notifyAdmins`（title「客户申请找回密码」，link=`/admin/password-resets`）。
- **后台**：`GET /api/admin/password-resets`（待处理列表 + `pendingCount`）、`POST /api/admin/password-resets/[id]`（`approve`/`reject`，要求 ADMIN）；页面 `/admin/password-resets`，侧栏入口「找回密码」（ADMIN 专属，位于「消息中心」之后）。
- **批准**：`src/lib/auth/temp-password.ts` 生成 **14 位强随机临时密码**（`crypto.randomInt` CSPRNG + 拒绝采样、剔除 `0O1lI` 混淆字符、必然含大小写/数字/符号以过 `passwordSchema`）→ bcrypt 入库 + `mustChangePassword=true` + `passwordChangedAt` + `revokeAllUserTokens` 吊销该用户全部会话 → 邮件模板 `temp-password` 下发明文。响应里 `tempPassword` 是**一次性明文兜底**（邮件不可用时管理员当面/电话转达），DB 不存明文、后台不回显历史。
- **首登强制改密（双重门控，缺一不可）**：
  1. `src/proxy.ts` 读 cookie `pwd_change_required` 把用户钉在 `/auth/change-password`（页面 307；其它 API 403 `PASSWORD_CHANGE_REQUIRED`）；放行 `/api/auth/**`、`/api/user/password`、`/api/currency`、`/api/healthz`，页面仅放行改密页与登录页（否则会话过期会与中间件形成重定向死循环）。
  2. DB 侧 `requireUser()` 读到 `mustChangePassword` 即抛 403——防「手删 cookie 绕过」的兜底。
- **改密出口**：既有 `PUT /api/user/password`（用 `requireUserAllowingPendingPasswordChange` 拿会话，否则被强制改密的用户会自我锁死）；成功后清 `mustChangePassword` + 清 cookie + 重新签发会话，审计按来路区分 `USER_PASSWORD_CHANGE_FORCED` / `USER_CHANGE_PASSWORD`。
- **新增页面**：`/auth/change-password` 挂在 `(checkout)` 路由组（避开店铺页头页脚）；无会话→登录页；无强制要求→「无需改密」态而**不是**重定向（避免与中间件形成死循环）。
- **运维要点（重要）**：`MAIL_PROVIDER=console` 时临时密码邮件不会真正投递，只能靠管理员在弹窗里转达；**生产必须配置 `resend` 或 `smtp`**，否则找回密码流程对用户不可用。
- **遗留路径（现状说明）**：token 自助重置链路（`POST /api/auth/reset-password` + `/auth/reset-password` 页 + 邮件模板 `reset-password` + `signEmailToken("reset-password")`）代码仍在，且被 `tests/integration/auth.test.ts` 覆盖；但**前台已无任何入口触发它**——`/api/auth/forgot-password` 现在只创建审批申请。本轮刻意不在改鉴权主链路时顺手删除；如确认不再需要，归入 13.9「死代码清理」一并处理。

### 2.14 后台能力同步（Phase 10/11 + 本轮）

- **支付渠道三态**：未配置/已配置/可收款（`PaymentProvider.isReady`）；前台 `available = enabled + configured + ready`，预留渠道即使配置并启用仍置灰「暂未开通」；未配置渠道开关禁用（UI）+ 服务端 `badRequest` 双保险。六渠道：mock / stripe / paypal / alipay / wechat / bankcard。
- **币种业务补齐**：`PaymentProvider.supportedCurrencies` 声明（国内三网关仅 CNY）；`/api/payment/channels?currency=` 标记 `currencyMismatch` 置灰，`createPaymentUrl` 服务端同口径兜底；仪表盘新增「各币种销售汇总」卡（原币营收 + 订单数 + ¥折合）。
- **客户管理细化**：列表新增「累计消费」（按各订单汇率快照折算 CNY）与「最近下单」，详情新增消费汇总与到货提醒订阅数，「邮箱未验证」一键筛选。
- **到货提醒商品卡邮件**：预售开售分支（`isPresale`）、库存紧迫提示、420px 居中商品卡（图/名/规格/价/CTA）、合规尾注双语。
- **联系表单留言**：`ContactMessage` 模型（迁移 `20260919082929_add_contact_messages`）+ 公开 `POST /api/contact`（蜜罐 + IP 5/h 限流，先落库再发信防静默丢单）；后台 `/admin/faqs` 内含联系页内容编辑（`/api/admin/contact-content`）。**注意：目前没有独立的「留言收件箱」后台页，留言仅入库 + 邮件通知 `contactEmail`。**
- **FAQ 双语**：`Faq.questionEn/answerEn`（迁移 `20260918151746_faq_i18n`），前台按当前语言回落。
- **GDPR Cookie 横幅**：`src/components/shop/cookie-consent.tsx` 挂载在 `(shop)/layout.tsx`；页脚 `Cookie Consent` 走 `?preview_privacy_banner=1` 强制重开横幅（原生 `<a>` 全页导航才能让目标页重新挂载）。
- **消息中心**：站内通知未读数 + 未读订单 + 待退款合并角标（30s 轮询），单条/清空已读/清空全部删除。


#### 分销模块 P0 加固与通知（2026-09-21）

| 项 | 关键实现 | 为什么必须有 |
| --- | --- | --- |
| 部分退款冲正 | `reversalRatioForOrder` + `applyOrderReversal`（增量 + CAS 幂等），流水 `reversedAmount/reversedCny`，结算按净额 | 部分退款后订单仍 PAID，原来的整单口径会漏冲 |
| 账本不随用户消失 | `toUserId`/绑定/提现外键改 `SetNull` + 快照字段 | `Cascade` 会把财务账本级联删掉 |
| 换绑重建子树 | `rebuildSubtreeClosure()` 广度优先重算祖先链 | REBOUND 分支曾漏挂 → 下级继续按旧链分佣 |
| 历史不回溯 | `SiteSetting.distributionEnabledAt` 基线 + 自然单归档 | 否则用今天的绑定改写历史归属 |
| 结算兜底 | `POST /api/admin/distribution/settle` | CRON 关闭时佣金永远卡在「在途」 |
| 账户对账 | `verifyAccountConsistency()` + `POST /api/admin/distribution/verify` | 物化汇总需与流水对平 |
| 通知 | `distribution/notify.service.ts`（非阻塞）+ 邮件模板 `distribution-notice` | 钱的状变必须主动送达 |
| 固定金额返佣 | `commission_rules.mode/fixedAmount` + `resolveRule` 统一解析 | 运营需要"每单固定返 X"与封顶防返穿毛利 |
| 规则生效期 | `effectiveAt/expireAt` 在 `resolveRule` 按注入 `now` 判定 | 促销期规则到期自动失效，无需人工停用 |
| 提现 KYC | `withdraw_records.payeeName/payeeMethod/userEmail`，服务端强制实名 | 线下打款必须能核对到人（一期无自动打款） |
| 规则确认 | `distributor_accounts.termsAcceptedAt` + 提现前勾选 | 资金往来需留合规确认时间 |
| 人工冲正 | `reverseCommissionManually` + `POST .../commissions/[id]/reverse` | 刷单认定/客服赔付等自动冲正覆盖不到 |
| 风控视图 | `getRiskReport()` + `/admin/distribution/risk` | 自购/负余额/高频退款/大额提现/超层级规则集中可见 |
| 升级记录 | `getPromotionLog()` + `/admin/distribution/promotions` | 自动授予资格必须可追溯 |
| 换绑审核 | `rebind_requests` + `reviewRebindRequest`（通过时走 `skipApproval`） | 换绑是资金关系变更，必须人工确认 |
| 导出 | 佣金/提现 CSV（`lib/csv` 注入防护） | 对账与线下打款需要可直接交付的表 |
| 推广海报 | `GET /api/distribution/my/poster`（SVG，嵌套 QR） | 分销商需要可直接转发的物料，而非只给链接 |
| 配置/规则缓存 | `lib/cache` + `invalidateDistributionCache()`（写时失效） | 最热读不该每次打库；但钱的视图永不缓存 |
| 并发保证 | 结算/冲正的 CAS 条件更新 + 集成用例（5 并发） | 分布式下"钱被算两遍"是最贵的事故 |
| 分销商等级 | `distributor_accounts.tier` + `commission_rules.tierLevel`；佣金链逐环带等级 | 等级越高比例越优，且逐级各按本人等级解析 |
| 业绩预聚合 | `distribution_daily_stats` + `rollupDistributionDailyStats()`（幂等，调度器每轮跑） | 团队报表不再每次全表扫描；明细页仍读实时表 |
| 汇总防脏数据 | 汇总前过滤已删除用户（归属快照无外键） | 硬删用户后重跑汇总会撞外键（已复现并修） |

### 2.15 分销 / 多级佣金系统（隔离模块，2026-09-20）

大爷要求「完整实施分销/多级佣金，但**不要改废本网店的面目**」，因此本模块的设计前提是
**商城可以完全不知道自己装了分销**。

**隔离与解耦（架构约束，不是口号）**
- 商城只 import 一个接口面：`src/server/services/distribution/bridge.ts`；
  分销内部实现（config/relation/bind/commission/account/report）**永不被商城引用**。
- bridge 内部一律 **动态 import + try/catch**：分销 DB 抖动、规则配错、代码 bug 都只记日志，
  绝不影响下单/支付/发货/退款这些生命线。
- 总开关 `DISTRIBUTION_ENABLED=false`：代理层不写推广 cookie、6 个钩子立即返回、
  分销 API 全部 404、后台与个人中心入口隐藏 —— 商城行为与未装该模块**逐字节一致**。
- 商城侧改动只有 **6 处加法**（`proxy.ts` 推广 cookie / 注册绑定 / 下单归属 /
  `order.service` 的支付·收货·退款冲正 / 调度器对账）+ 两个导航项（个人中心「我的推广」、后台「分销」）。

**数据模型**（独立命名空间，只给 `User`/`Order` 加最小外键；迁移 `20260920185628_distribution_module`）

| 表 | 作用 | 关键约束 |
|---|---|---|
| `distribution_relations` | 分销树**闭包表**（无限级） | 主键 `(ancestorId,descendantId)`，`depth=0` 是自己；索引 `(descendantId,depth)` |
| `distributor_customer_binds` | 客户归属绑定 | **`customerId` 唯一** = 数据库级「不可抢绑」 |
| `commission_rules` | 佣金规则 | `(scopeType,scopeId,level)` 唯一；GLOBAL 的 `scopeId` 用空串（PG 里 NULL 互不相等会让唯一约束失效） |
| `commission_logs` | 佣金流水（只追加） | 幂等键 `(orderId,toUserId,level)`；状态 PENDING/SETTLED/REVERSED |
| `distributor_accounts` | 账户物化汇总（CNY） | 余额由流水汇总而来，对账以流水为准 |
| `withdraw_records` | 提现单 | PENDING/APPROVED/PAID/REJECTED |
| `order_attributions` | 下单归属快照 | 不可变（已有行不覆盖），自然单 `natural=true` |

**业务口径（全部硬编码进系统，不只是文档）**
- 归属：① 已有有效绑定 → 归绑定分销商，**忽略本次链接**；② 无绑定且带可用码且从未下单 → 先补绑再归；
  ③ 都不满足 → 自然单，**不产生任何佣金**。
- 升级：首次成功推广即 `isDistributor=true`（无申请/无审核）；他作为客户绑定的上级，
  自动成为他作为分销商的上级（闭包按此重建）。
- 计佣：基数 = 商品**实付**小计（`subtotal − discount`，**不含运费/税**）；默认三级 10%/5%/2%；
  层级上限与**总比例封顶**可配（合规红线）；自购默认不返自己、上级照常分；金额精确到分并折 CNY。
- 结算：支付 → PENDING；确认收货（或持有期到期，调度器）→ SETTLED 入可提现余额；
  退款/取消 → REVERSED 并从余额扣回（可为负，挂账抵扣）。
- 提现：申请（原子扣余额 + 同一用户仅一笔在途）→ 审核通过 → **线下打款**标记 → 打款核销；
  驳回解冻退回。一期不接自动代付（需主体资质 + KYC + 代扣个税）。

**可靠性：钩子只是加速器，对账才是保证**
`reconcileDistribution()`（调度器每分钟 / 后台「立即对账」按钮）扫平四类问题：
已支付无归属 → 补归属；有归属无佣金 → 补算；已退款未冲正 → 冲正；到期未结算 → 结算。
因此商城侧钩子漏调不会变成错账 —— 这也是「解耦」能成立的前提。

**权限与脱敏**（服务端出参前完成，前端隐藏不算数）
- 分销接口一律 `requireUser` 取会话身份，**绝不接受前端传的 distributorId**；平台接口 `requireAdmin`。
- 手机号 `138****1234`、邮箱 `a***@x.com`、姓名 `张**`、地址只给「省 市」；间接下级只给汇总不给明细。

**接口**
- 分销商端 11 个：`my/links`、`my/account`、`my/qrcode`、`my/customers`、`my/orders`、
  `my/subordinates`、`my/commissions`、`my/stats`、`my/withdrawals`、`withdraw`、`bind`
- 平台端 12 个：`overview`、`config`、`rules`(+`[id]`)、`commissions`、`withdrawals`(+`[id]`)、
  `relations`、`reports`、`distributors`、`unbind`、`reconcile`
- 界面（入口形态经大爷 2026-09-20 反馈重做）：
  - **不占主站导航**：账户左侧导航不列分销入口（避免"污染主站"），只在账户页放一张
    **分享小卡片**（说明 + 专属链接 + 复制；成功推广后才多出「进入分销中心」与余额小数字）。
  - **`/account` 重做为账号总览页**（大爷 2026-09-20：「点进去就相当于账号的总预览页，
    样式要符合整站风格」）：原先是 `redirect("/account/notifications")`，导致分享卡片藏在
    Profile 子页、点 Account 根本看不到。现在 SSR 直出「四张概览小卡（累计订单/进行中/收货地址/
    未读消息）+ 分享卡片 + 最近两单（复用订单页同款 `OrderCard`）」，
    全部使用商城既有 `Card`/`OrderCard`/`EmptyState` 视觉，不引入新设计语言；
    刻意不做成"什么都有"的仪表盘（设置/导出/注销仍在 Profile 页）。
  - **现代面板视觉**（大爷第三轮反馈）：`globals.css` 新增**作用域化**圆角/阴影口径 ——
    仅 `[data-modern-cards]`（账户概览）与 `[data-dist-center]`（分销中心内容区）生效，
    覆盖 `.rounded-md`(10px) / `.shadow-card`(柔和分层) 并新增 `.panel`(14px 圆角)；
    **商城前台保持方角无阴影**（`--radius: 0`）不受影响。分销中心补页面主标题 + 副标题，
    Tab 改胶囊态，统计卡改「图标胶囊 + 大数字」，分享卡改渐变底。
  - **独立窗口 + 同款视觉**：分销中心在 `/distribution`（独立路由组 `(distribution)`，从分享卡片
    **新标签页**打开），套用与商城**完全相同**的页头/页脚/Provider（复用 `(shop)/layout.tsx` 同一批
    组件），二级 Tab 也用账户导航同款样式（激活态黑底白字）——大爷反馈「样式太简单，要跟原网站风格
    一样，只不过新开一个窗口」后定为这一版；「独立」体现在功能与入口（不占主站导航、不塞进账户页），
    不再体现为"简陋外壳"。
  - **推广链接 = 商城首页**（`/?ref=CODE`，二维码同链接）：朋友点开就是正常购物页，
    归属由代理层签名 cookie 完成，与分销中心路径彻底分开。
  - 后台「分销」二级 Tab 7 页。

**验证**：纯函数单测 **30/30**、集成测试 **19/19**、QA 端到端 `scripts/qa/qa-distribution.mjs` **ALL PASS**
（推广 cookie → 注册绑定 → 自动升级 → 下单归属 → 支付三级计佣 → 发货确认收货结算 → 后台 4 页 → 分销商后台 5 页与脱敏 → 提现申请/审核/打款核销），见 §4。测试期间抓到两个真 bug：闭包表在真实流程里没人写（佣金恒为 0）、
`planClosureRows` 产出重复闭包行（主键冲突）。


---

## 3. 关键决策记录（ADR 简表）

| # | 决策 | 理由 |
|---|---|---|
| 1 | 库存真相在**组合粒度**（`ProductVariant`），`stock = Σ 组合`（服务端重算）；属性组添加顺序即层级（第一个=父组，只读合计）；维度池 `specStock` 废止（存量保存一次即收敛） | 大爷定稿的商业模型：父组库存由子组决定，任何入口不许手写；两套模型并存必然出现「维度数字 ≠ 组合之和」；`variantSignature` 前后端同键，杜绝错位（2026-09-30 全链路统一） |
| 2 | 整件库存同步放**服务端兜底**（非仅前端） | API 直调也无法造成两处数字漂移；单测覆盖 |
| 3 | 密钥存 DB 但 API 返回脱敏 + 空串保留 | 满足"后台直接填支付凭证"需求，同时避免明文回显；生产建议密钥走 .env 的提示保留 |
| 4 | 支付渠道化 + 三态语义（未配置/已配置/可收款） | 预留渠道即使配置启用也不可被选中（`available=enabled+configured+ready`），顾客不可能选到必然失败的方式；Stripe 渠道填密钥即真实收款，无渠道行时行为与旧版一致（零破坏） |
| 5 | PDP 间距以官方实测 48px 为准 | 用户三次反馈（68 开/12 紧/32 中）后官网可访问，直接实测取真值，不再凭感觉 |
| 6 | 前台默认英文 + 路由级 locale（`/zh` `/en`），后台强制中文 | 官方为英文站（欧美客群）；`/zh` 前缀供 SEO/爬虫与中文场景，币种 cookie（CNY→zh）优先级高于路由前缀，避免语言切不回英文 |
| 7 | LOGO 反色用 Canvas 逐像素（Playwright） | 环境无 PIL；alpha 保真、颜色可控，实测无损失 |
| 8 | route 文件不导出业务常量 | Next App Router 对 route 导出白名单强校验，独立模块 `lib/payment-gateways.ts` |
| 9 | 注销采用**匿名化软删**（保留订单财务数据） | GDPR/个保法口径：删除个人信息但保留交易合规记录；先发确认邮件再匿名化（替换后不可送达） |
| 10 | 找回密码走**人工审批**，不做「邮箱即凭证」自动重置 | 原站语义就是人工审核；自动重置无法拦截被入侵邮箱，人工审批可按备注甄别身份 |
| 11 | 强制改密**双重门控**（中间件 cookie + `requireUser()` 读 DB） | cookie 层做 O(1) 快速拒绝与体验，DB 层兜底「手删 cookie 绕过」；两层缺一不可 |
| 12 | 临时密码明文只出现两处（邮件 + 批准响应一次性回显） | DB 只存 bcrypt 哈希，后台不回显历史；邮件通道不可用时管理员仍有一条兜底转达路径 |
| 13 | 上传按用途归档 `uploads/{purpose}/年/月/` | 图片不混放便于运维检索；purpose 白名单收敛未知值为 `misc`，防路径注入与目录爆炸 |
| 14 | 分销对商城只暴露一个 `bridge.ts`（动态 import + try/catch + 总开关） | 「隔离/解耦」要落到可验证的约束：商城不 import 分销实现、分销故障不影响商城、一个环境变量即可整体下线 |
| 15 | 闭包表存关系、`customerId` 唯一存归属、`order_attribution` 存快照 | 三件事三种数据结构：关系要无限级与一次查询、归属要防并发抢绑、历史订单归属要不可变可对账；混在一张表里必然互相妥协 |
| 16 | 佣金正确性由**对账补偿**保证，钩子只做加速 | 钩子分散在商城 4 个业务流程里，漏调/异常是常态；每分钟幂等扫平漏记漏冲正，才能既解耦又不丢账 |

---

## 4. 验证体系与质量门

- `npx tsc --noEmit` — **0 错误**（全迭代保持）。
- `npm run test:unit` / `npm run test:integration`（vitest）— 当前 **49 个文件 / 473 用例全绿**（2026-09-30 实测：tests/unit 28 文件 301 例 + tests/integration 21 文件 172 例；含组合粒度库存、specStock 守恒、到货通知、分销对账等）。
- `npm run test:e2e`（Playwright）— tests/e2e **5 个 spec**（`shop` / `auth` / `admin` / `admin-shipping` / `visual` 视觉基线）；配置见 `playwright.config.ts`（workers=1、expect.timeout 30s、`maxDiffPixelRatio 0.02`、webServer 300s）。
- `npm run verify` = typecheck + qa:static（hardcode / error-lang / links:static）+ 单测。
- i18n 双向守卫：`tests/unit/i18n-keys.test.ts`（`t()` 的键必须在词典里）+ `tests/unit/i18n-hardcoded.test.ts`（**账户区/分销中心的可见文案不得硬编码英文**，覆盖 JSX 文本节点与 placeholder/aria-label/title/alt/label）。
- 分销模块：纯函数单测 `tests/unit/distribution.test.ts`（30 例：比例优先级/总比例封顶/自购/层级上限/闭包行去重/脱敏/推广码签名防篡改/开关默认值）+ 集成测试 `tests/integration/distribution.test.ts`（19 例：绑定与自动升级/闭包链路/不可抢绑/复购归属/自然流量/三级计佣金额/幂等/收货结算/退款冲正扣回/自购/提现三态/行级权限与脱敏/对账补偿）+ QA `scripts/qa/qa-distribution.mjs`（推广 cookie → 注册绑定 → 下单归属 → 支付计佣 → 后台页面 → 分销商后台脱敏 → 提现）。
- QA 脚本 `scripts/qa/*.mjs`（含新增 `qa-password-reset.mjs`，以及 `qa-phase12.mjs` / `qa-payment-channels.mjs` / `qa-shipping.mjs`）+ `scripts/design-assertions.cjs`（15 项设计令牌断言）。
- Playwright DOM/几何断言：售罄斜线出头 4.7px、下拉 dx=0 同宽、政策即时生效、specStock minΣ 联动、403 门禁、密钥脱敏、LOGO 亮度、官方 48px 对比。
- curl API 全链路：CSRF(double-submit) → 登录 → 管理 API 读写。

**开发期已知事项**：
- dev server 长时间运行后客户端水合可能失效（页面 SSR 正常但交互不响应）——重启 + `rm -rf .next` 即恢复；上线必须生产构建。
- 生产启动受 `REQUIRE_STRONG_SECRETS` 密钥守卫保护（设计行为）：`next start` 前需配置 ≥32 位随机 JWT 密钥，或本地演示显式 `REQUIRE_STRONG_SECRETS=false`。
- 本机 SIP 关闭（Custom Configuration），PG 用 `scripts/start-db.sh`（GCD workq 自检豁免 dylib）启动；macOS 15.7+ Homebrew PG 需先跑 `scripts/fix-postgres-multithreaded.sh` 打二进制补丁（icu4c 78 静态初始化开线程导致 postmaster 必炸，LC_ALL/DYLD interpose 均无效）。（原 embedded-postgres 遗留脚本已删除）
- **改了 `prisma/schema.prisma` 或跑完迁移后必须 `bash scripts/restart-dev.sh`**：dev server 不会热加载 Prisma Client，stale client 会报「Unknown argument」甚至 500。
- 项目在 Time Machine 网络卷：Turbopack 首次编译慢（可达数十秒），QA/E2E 的 toast/路由等待需放宽到 60s、截图超时放宽到 30s。
- 曾发生验证脚本误触演示数据（DELETE/PUT）→ 已按 seed 基线核对恢复；**自动化操作后台需只走 API 直连**。

---

## 5. 遗留与建议（按优先级）

1. **支付真实接入收尾**：Stripe 渠道化已可收款（后台填密钥 + `/api/webhooks/stripe` 验签）；alipay/wechat/bankcard/paypal 仍为预留级——`createPayment` 明确抛「尚未接入真实下单请求」而非误扣款，待商户账号/网关就绪后补真实调用与验签即可。
2. **PDP 图册**：官方首图为 4 张候选（大图+缩略图+轮播），当前 Gallery 缩略图列逻辑已就绪，可继续对齐灯箱/放大镜细节。
3. **生产部署**：JWT 密钥、支付渠道密钥、S3 存储驱动、邮件服务均走 .env；`next build && next start` 前先过密钥守卫；多实例运行依赖 PG 咨询锁选主 + 库存行锁。
4. **汇率上游**：open.er-api.com 免费源日更一次，商用建议切换付费/自建源（`currency-server.ts` RATE_API 一处配置）。
5. **旧数据目录**：老 ecommerce datadir 从未找到（集群 8-21 后为空），当前目录为重建演示数据；如用户找到旧 datadir 可恢复。
6. **i18n 前台**：路由级 locale（`/zh` `/en` + `x-lang`）与词典覆盖已落地；剩余为 `/zh` 全量文案走查（此前以英文为主）。
7. **联系表单留言缺后台收件箱**：`ContactMessage` 已落库 + 邮件通知 `contactEmail`，但没有独立的后台列表页/API（见 §2.14）；若留言量上来需要补 `/admin/contact-messages`。
8. **Phase 13.9 收尾待办**：死代码清理（需 knip 类工具全量扫描）+ 文档收口。

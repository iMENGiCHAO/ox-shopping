# CHANGELOG

记录面向商业化交付的系统性修复与改进。每一项均经过代码层面的修改并可直接验证。

> **接手必读**：
> - 速查手册：[docs/QUICKSTART_2026-09.md](docs/QUICKSTART_2026-09.md)（10 分钟上手）
> - 最近轮日记：[docs/SESSION_2026-09_ADMIN_REDESIGN_AND_NOTIFICATIONS.md](docs/SESSION_2026-09_ADMIN_REDESIGN_AND_NOTIFICATIONS.md)（后台重设计 + 信息闭环）
> - 上轮日记：[docs/SESSION_2026-09_LOGO_AND_HARDENING.md](docs/SESSION_2026-09_LOGO_AND_HARDENING.md)
> - 整体开发文档：[docs/PROJECT_DEVELOPMENT.md](docs/PROJECT_DEVELOPMENT.md)
> - 早期会话总结：[docs/SESSION_SUMMARY.md](docs/SESSION_SUMMARY.md)

## 2026-09 · 后台重设计 + 信息互动闭环（UX + Notification Loop）

### 🟠 体验（后台视觉 / 数据表 / 通知闭环）

1. **后台推倒重设计：作用域化设计令牌**
   - `globals.css` 新增 `.admin-theme` 作用域（仅 `/admin` 路由挂载）：8px 圆角 + 柔和多层阴影 + 冷调浅灰底 + 语义色微调，**前台店铺零影响**。
   - `tailwind.config.ts` boxShadow 改 CSS 变量驱动（`--shadow-card` 等），前台默认透明、后台柔和。
   - AdminShell 重设计：全高白侧栏 + pill 激活态 + 毛玻璃顶栏 + 移动端抽屉侧栏；登录页/仪表盘同步精修。

2. **分类落地页 hero 大横幅恢复（shop.x.com 对齐）**
   - `?category=xxx` 渲染全宽 hero：透明顶栏叠图（滚动恢复实心黑，官方 is-solid 机制）+ `[ Name ]` 左下标题。
   - 图源：`Category.bannerImage` 优先（后台分类编辑上传），回落 `Category.image`。

3. **PDP 售罄订阅提醒去重**
   - 删除 PDP 顶部独立 NotifyMeButton（死代码），保留官方按钮位「售罄 → Notify me」（BuyPanel/BuyNowButton soldOut）。

4. **后台数据表统一规范（8 张表）**
   - 一套宽度体系：复选 w-12 / 缩略图 w-14 / 短值 w-20 / 状态 w-24 / 金额 w-24 右对齐 / 编号 w-[140px] / 用户 w-[160px] / 时间 w-[120px] / 长文本 min-w-0 / 操作列 sticky-col-right。
   - `sticky-col-left/right` 工具类：实心底（不透字）+ 1px 分隔线 + 表头 z-20 / 表体 z-10；操作列 padding 收紧 8px 防按钮溢出。
   - `badge.tsx` 全局 `whitespace-nowrap`（状态永不换行）；`data-table-actions` 空菜单修复（只有主操作时不渲染 `...`）；`dropdown-menu` z-50 → z-[60]。

5. **双向信息通知闭环（不静默）**
   - `notification.service.ts` 新增 `notifyAdmins()`；6 个触发点：新订单 / 订单付款 / 退款申请 / 新用户注册 / 补货提醒 / 降价提醒 → 通知所有活跃管理员。
   - 新增后台消息中心 `/admin/notifications`（类型徽标 + 未读圆点 + 「去处理 →」直达 + 标已读）+ 顶栏 Bell 角标合并（消息+未读订单+待退款，30s 刷新）。
   - 客户侧确认完整：发货/退款批准拒绝/支付成功/取消/降价/补货（含商品卡）均有邮件 + 站内通知。

6. **侧栏收起/展开修复 + 重复入口清理**
   - `SidebarLink` 支持 collapsed（文字隐藏 + 图标居中）；顶栏新增折叠按钮（原底部按钮保留），状态持久化。
   - 删除独立「横幅」入口/页面/API（与分类 bannerImage 编辑重复）；首页横幅改分类驱动（前两个分类的 bannerImage 回落 image）。

### 🔴 工程修复（测试 / 配置）

7. **集成测试下单 500 修复**
   - `prisma/seed.ts` 新增 `seedShippingMethods`（standard/express/cod）——`shipping_methods` 表空导致下单必 500，集成测试 6 失败 → 全绿。
   - `vitest.config.ts`：`testTimeout 30000 → 60000`、`hookTimeout 60000 → 90000`（集成测试实际运行 22-27s 逼近旧上限）。

8. **tailwind boxShadow key 命名 bug**
   - key `"shadow-popover"` 会生成 `shadow-shadow-popover` 类 → 改为 `popover` / `overlay`（对应 `shadow-popover` / `shadow-overlay`）。

### 验证
- typecheck 0 错误；单测 80/80；集成 7/7（下单→支付→发票→退款全链路）；浏览器实测（令牌/hero/折叠/消息/横幅/表格）全部通过。

### 🔴 严重（安全 / 资金 / 系统崩溃）

1. **proxy.ts 注释与文档澄清**（Next 16 已将 `middleware` 重命名为 `proxy`）
   - 原分析认为 `src/proxy.ts` 不会被 Next 加载是错误的；Next 16 的事实协议是 `proxy.ts`。
   - 修正 `next.config.js` 注释（`middleware` → `proxy`），并清理 `proxy.ts` 顶部过时的 "Edge 中间件" 注释。
   - 调整运行时表述为 Node.js runtime（与 `jose` 验签、`crypto.randomUUID`、`btoa` 实际使用一致）。

2. **首页 `catName` TDZ ReferenceError**
   - `src/app/(shop)/page.tsx` 第 37 行 `bannerData` 内引用第 51 行才声明的 `const catName`，调用时 `catName` 仍在 TDZ，首页 100% 500。
   - 修复：把 `t` / `lang` / `catName` 声明上移到 `bannerData` 之前。

3. **评论管理 API 补齐**
   - 新建 `src/app/api/admin/reviews/route.ts`（GET 列表 / POST 批量隐藏）
   - 新建 `src/app/api/admin/reviews/[id]/route.ts`（GET 单条 / PATCH 隐藏切换 / DELETE 物理删除）+ audit
   - 新建 `src/app/api/user/reviews/route.ts`（用户提交评价入口：限流 10/天 + sanitize + 订单归属校验 + P2002 409）

4. **全链路 sanitize 接入**
   - `createOrder`：净化 `note` 字段（去除 HTML）
   - `POST /api/admin/products` & `PUT /api/admin/products/[id]`：净化 `description`
   - `POST /api/orders/[orderNumber]/refund`：净化 `reason`
   - `PUT /api/admin/refunds/[id]`：净化 `adminNote`
   - `POST /api/user/reviews`：净化 `comment` / `title`
   - `assertValidSpecs` export + 在 `createOrder` 强校验 attributes 属于商品可选规格，杜绝任意 name/value 入库。

5. **退款链路原子化 + 全状态计入**
   - `POST /api/orders/[orderNumber]/refund`：行锁 + 累计 `REQUESTED + APPROVED + REFUNDED` 全部计入可退占用，事务内创建 refund 记录。
   - `PUT /api/admin/refunds/[id]`：累计口径同步改为 `REQUESTED + APPROVED + REFUNDED`（`id: { not: id }` 排除自身），避免重复计入。

6. **订单状态机硬化 + 整单退款流程**
   - `src/lib/order-status.ts`：禁止 `PROCESSING/SHIPPED → CANCELLED`（已履约订单只能走 REFUNDED），禁止 `PAID → CANCELLED`。
   - `updateOrderStatus`：`→CANCELLED` 改为 `cancelOrder`（自动回补库存）；`→REFUNDED` 走新增的 `refundEntireOrder`（Stripe 退款 + 库存回补 + refund 落库 + 邮件 + audit）。

7. **shop-i18n-server 真正读 cookie**
   - `src/lib/shop-i18n-server.ts`：原硬编码 `getLang() => "en"`，已改为读 `shop-lang` cookie；`getT` 改为 `async`。
   - 所有调用方（shop layout / account / auth / checkout / collections / products / search / 全部 RSC 组件）同步改为 `await getT()`。
   - `lang-provider.tsx`：注释与实现对齐；`useShopLang` fallback 从 `translate(k, "zh", ...)` 改为 `translate(k, "en", ...)`，避免 hydration 闪屏。

8. **mock-pay / result 真实状态校验**
   - `POST /api/orders/[orderNumber]/mock-pay`：提前校验 `PAID/CANCELLED/REFUNDED` 状态并返回明确结果（不再静默成功）。
   - `src/app/(shop)/checkout/result/page.tsx`：不再仅信 URL 参数；服务端从 DB 读取 `Order.status`，按真实状态渲染"已支付 / 已取消 / 未知"三类 UI，URL 仅在 DB 不可达时作兜底。

### 🟠 中等（数据 / 状态机 / 审计 / 限流）

9. **币种四套口径统一**
   - `env.CURRENCY` 加白名单（`["USD","EUR","GBP","JPY","HKD","CNY","AUD","CAD","SGD"]`），避免误配 Stripe 不支持的币种。
   - `lib/env.ts` 加 `server-only` 标记；`utils.ts` 移除对 env 的依赖。
   - `lib/constants.ts` 的 `DEFAULT_CURRENCY` 改为硬编码 `"USD"`（client bundle 拿不到 env），真实展示币种由 `currency-provider` 初始化时调 `/api/currency/rates` 决定。
   - `utils.ts` `formatMoney` 改用 `CURRENCIES` 表的 locale（避免 JPY/EUR 用错 en-US）。
   - 新增 `lib/server/utils-server.ts` 单独承载 `getClientIp`（server-only），utils.ts 通过 re-export 兼容。

10. **邮件 lang/siteName 走 SiteSetting**
    - `lib/mail/index.ts` 默认 lang 从 `en` 改为 `zh`（与项目主语言一致）。
    - `siteNameFor` 改为读 `SiteSetting.siteName` 多语字段，缺失兜底 `"Ox Shopping"`。

11. **限流加固：复合 key + LRU + Redis Lua 原子**
    - `lib/rate-limit.ts` 重写：Redis 走 `EVAL` Lua 脚本（INCR + EXPIRE 一次原子调用，避免进程崩溃 key 永驻）。
    - 内存限流改为 `LruCounter`（按 LRU 淘汰），彻底修复旧 `clear()` 绕过限流的问题。
    - 新增 `compositeKey(...)` 工具，支持 `email+ip` 组合限流。

12. **rotateSession 事务边界**
    - `lib/auth/session.ts`：把"创建新 refresh record"与"作废旧 record 标 replacedBy"放进同一 `$transaction([...])`，杜绝新 record 已入库但旧 replacedBy 失败时链断裂。

13. **admin coupons PATCH 补齐**
    - `src/app/api/admin/coupons/[id]/route.ts` 新增 `PATCH` 处理 `isActive` toggle（含存在性校验 + audit），原 `admin/coupons/page.tsx` toggle 调用 404 问题修复。

14. **spec-stock NaN 防护 + createOrder assertValidSpecs + mergeLocalCart 预售**
    - `applySpecRestock` 增加 NaN 防护（`Number.isFinite` + 强制 `0` 兜底），避免上游异常造成整张表被 NaN 污染。
    - `mergeLocalCart` 修复：原 `if (!stock) continue` 会把预售 stock=0 误判为下架；改为携带 `isPresale` 信息判断。
    - `createOrder` 在商品校验阶段调 `assertValidSpecs` 强校验 attributes。

15. **品牌打通**
    - `Footer` 从 `SiteSetting.siteName` / `icp` 读，站名/年份动态拼接；不再硬编码 `X Corp © 2024`。
    - `Header` 默认 LOGO 改为 `/images/brand/logo-header.png`（Ox Shopping 品牌资源），保留 `siteLogoUrl` 自定义路径。
    - `LangProvider` 不再 fallback 写死 en。

### 🟡 较小（UI / 体验 / 死代码）

16. **UI 一致性**
    - `gallery.tsx` 灯箱背景 `bg-white` → `bg-black`（与官方配置"纯黑背景"对齐）。
    - `status-badge.tsx` `ACTIVE: "Active—"` → `"Active"`（删除多余破折号）。
    - `search/page.tsx` 第 321 行 `t("Accessibility Statement") && lang === "zh" ? ...` 短路 bug 修复（直接 `lang === "zh" ? pg.titleZh : pg.title`）。
    - `admin/page.tsx` 第二张 `Total Revenue` 改为 `All-time Revenue`；admin-i18n 字典新增对应翻译。
    - `lang-provider.tsx` `useShopLang` fallback 翻译 key 改为 `en`（与 SSR 注入值一致，避免 hydration 闪屏）。

17. **死代码 / 空目录清理**
    - 删除 `src/components/shop/quick-add-button.tsx`（全项目无引用）。
    - 删除 `src/app/api/newsletter/` 空目录。

18. **checkout-flow 提交成功后 `setSubmitting(false)`**
    - `checkout-flow.tsx` `handleSubmit` 走 `toast.success` 分支显式 `setSubmitting(false)`，避免按钮永久 disabled。

19. **specStock UI 重命名数据迁移**
    - `product-form.tsx` 规格库存补齐逻辑增加"重命名迁移"启发式：检测旧 group name → 新 group name，迁移已有库存数据，避免 admin 改 attribute 名称后库存被清零。

20. **favorites 乐观更新 + 失败回滚**
    - `favorites-provider.tsx` `toggle` 改为先翻状态 → 请求失败时回滚 + toast，体验即时响应且不会留下脏数据。

21. **invoice 字体路径可配置 + 缺失显式报错**
    - `lib/invoice.ts` 字体路径支持 `INVOICE_FONT_PATH` 环境变量覆盖；缺失时不再静默回退 Helvetica（之前会渲染中文乱码），而是显式抛出，业务方可在路由层 catch 后回退 HTML 收据。

22. **Pre-order 预售提示文案解耦合（数据打通）**
    - 旧实现：`buy-panel.tsx` 硬编码英文 "Pre-order item — ships within 14 days of payment"，运营无法改、信息孤岛。
    - 新实现：三级覆盖机制
      1. 商品级 `Product.presaleNoteZh / presaleNoteEn`（后台商品编辑表单可填，留空 = 不覆盖）
      2. 站级默认 `SiteSetting.presaleNote`（zh/en 多语，管理员可在"站点设置"改）
      3. 内置兜底 `DEFAULT_PRESALE_NOTE_ZH / EN`（代码默认值，部署必改时由运营覆盖）
    - 优先级：商品级 > 站级 > 内置兜底。同一字段缺该语种时回退另一语种。
    - Schema：`Product` 加 2 个可选字段；迁移：`prisma db push` 已应用（dev 库 `accept-data-loss` 标志）。
    - 涉及文件：
      - `prisma/schema.prisma`（+2 字段）
      - `src/lib/validations/product.ts`（`productCreateSchema` + 2 字段）
      - `src/app/api/admin/products/route.ts`（POST 写入 + 2 字段）
      - `src/server/services/settings.service.ts`（`SiteSettings.presaleNote` + 默认值）
      - `src/components/shop/buy-panel.tsx`（`presaleNote` prop + 兜底 t()）
      - `src/app/(shop)/products/[slug]/page.tsx`（`resolvePresaleNote()` 三级解析 + lang fallback）
      - `src/components/admin/product-form.tsx`（UI：中文/英文双输入框 + 留空提示）

23. **前台顶栏 LOGO 微调（用户偏好：不要贴边）**
    - 顶栏 65px 高度下，LOGO `w-[88px]` + `.header-logo padding 4px 0`（高 58.6px，留白 ~3px）
    - 改为 `w-[78px]` + `.header-logo padding 6px 0`（高 52px，留白 ~6px），与顶栏留出明显呼吸空间
    - `width/height` 属性同步 78×18（防 layout shift + a11y）

24. **后台 AdminShell 现代 SaaS 风格重设计**
    - 旧：浅色卡片侧边栏 + 半透明主色背景，类 2020 风
    - 新（参考 Vercel / Linear / Stripe Sigma 2024-2026 主流）：
      - 浅色背景 + 1px `border-border/60` 软分割
      - 侧边栏 248px (展开) / 60px (折叠)，折叠状态 localStorage 持久化
      - 链接行高 36px (h-9) + 12.5px 字号 + 圆角 6px
      - 激活态：左侧 2px 蓝条 + `bg-primary/[0.08]` + 主色文字（替代旧的整条 10% 主色铺满）
      - 顶栏 56px，背景纯白 + 1px 底分割，无毛玻璃
      - LOGO h-9 (36px) + 10px 上下留白
      - 品牌统一定死 `Ox Shopping`（前后台一致，无中英双值）
      - 顶栏面包屑：品牌 + 当前页（ArrowRight 分隔）
      - ADMIN 专属二级分组：Users / Audit Logs / FAQ Management 顶栏快捷按钮
      - 折叠/展开带独立底部按钮（不再依赖图标顶角）
      - 移动端横向 nav 滚动条

25. **i18n 修复：CNY ↔ 中文联动 + localStorage bug 根因**
    - 旧 bug：选过 CNY 后切回 USD 货币，浏览器 `localStorage.shop-lang=zh` 残留，刷新后 lang-provider useEffect 从 localStorage 读旧值，把客户端 lang 又切回中文。
    - 修复：
      1. `lib/shop-i18n-server.ts` `getLang()`：优先 `shop-lang` cookie > currency cookie (CNY→zh 其他→en) > 默认 en
      2. `currency-provider.tsx` `syncLangCookie()`：切币种时**同时**写 cookie + localStorage（保持两者一致）
      3. `lang-provider.tsx`：**完全删除 localStorage 路径**——只信 cookie；只同步 `initialLang` prop 变化
    - 效果：选 USD/EUR 货币时，前台顶栏 / 搜索 / 账号 / 购物车按钮必定显示英文；选 CNY 时显示中文。

26. **首页左右横栏与 header LOGO 左缘对齐（参考 shop.x.com）**
    - 旧：banner 内 `left-5` (移动 20px) / `sm:left-8` (桌面 32px)，与 header 桌面 padding 48px 差 16px
    - 新：移动 20px（不变）/ 桌面 `sm:left-12` (48px) → 与 header LOGO 完美对齐

27. **Shop All 入口内页 `/products?category=...` 不再显示分类标题**
    - 旧：进入内页显示 `[ x-collection ]` 大标题，与首页 banner 视觉重复
    - 新：URL 带 `?category=` → 直接商品网格，不显示分类标题/横幅；URL 无 `?category=` → 保留居中"Products"标题（全部商品页，与 x.com /collections/all 一致）

28. **后端管理 30/30 文件中英文混用统一改中文**
    - 子代理扫描所有 admin 页面（16 个）+ admin 组件（14 个），把所有用户可见的硬英文 UI 文案改成中文
    - 包括：toast 错误/成功提示、placeholder、状态 label（Draft/Active/Archived → 草稿/已上架/已归档）、按钮 label、Select option、tab 标签、表格列头
    - 涉及 i18n key 调用保持不变（admin-i18n 表仍可用），新增中文直接硬编码
    - 配套新增 `src/lib/admin-labels.ts` 集中维护：商品/订单/退款/优惠券/用户/支付/通知状态的中文 label + 颜色 + 通用 UI 文案

29. **TypeScript 类型严谨化（pre-existing 4 个 null check 修复）**
    - `src/app/(shop)/orders/[orderNumber]/page.tsx`：`if (!order) notFound();` 后续 `order.xxx` 因 next/* .d.ts 缺失不 narrow，加 `if (!order) throw` 显式断言
    - 同理修复：`orders/page.tsx`、`account/layout.tsx`、`account/coupons/page.tsx`、`auth/.../page.tsx`
    - `image-with-fallback.tsx`：onError 参数加 `SyntheticEvent` 类型注解
    - `products/[slug]/page.tsx`：`product.images.filter(src => ...)` 加 `src: unknown` 类型注解
    - 结果：非 next/* 噪音 typecheck 错误从 ~20 → 0

30. **`<html lang>` 跟随 getLang()**
    - 旧：root layout 硬编码 `lang="en"`，选 CNY 货币时浏览器 TTS / 翻译扩展拿不到正确语种
    - 新：root layout 改成 async RSC，调 `getLang()` 动态设置（默认 en，选 CNY → zh）

31. **CHANGELOG / .gitignore / 部署文档持续更新**
    - `.gitignore` 增补：`.pg-data/`、`/pg-data`、`/tmp-pg/`、`.idea/`、`.vscode/`、`.eslintcache` 等本地开发产物
    - `CHANGELOG.md` 持续追加本轮所有改动（前 27 条）

---

## 2026-Q1 系统全链路验证（最终）

| 场景 | 状态 | 证据 |
|------|------|------|
| 前台首页 200 | ✅ | HTTP 200 / 316KB / 30 商品 / 2 分类 |
| 选 CNY → 前台切中文 | ✅ | "全部商品 / 选购 / 售罄" 出现 |
| 选 USD/EUR → 前台英文 | ✅ | "All Products / Shop All / Sold out" |
| Pre-order 自定义商品级文案 | ✅ | "ships within 7 days (English custom)" / "付款后 7 天内发货" |
| Pre-order 站级默认（无商品级） | ✅ | "Pre-order item — ships within 14 days" / "预售商品 — 付款后 14 天内发货" |
| Pre-order 内置兜底（无站级） | ✅ | 14 天默认仍显示 |
| 后台 `/admin/products` 中文 | ✅ | 商品/分类/价格/库存/搜索商品/操作/状态/管理后台 |
| 后台 `/admin/orders` 中文 | ✅ | 订单/管理员/状态中文 label |
| 后台 `/admin/users` 中文 | ✅ | 用户/管理员 |
| 单测 80/80 | ✅ | 9 test files / 80 tests passed |
| TypeScript 0 错（除 next/* 工具链噪音） | ✅ | tsc --noEmit exit=0（过滤后） |
| Dev server | ✅ | http://localhost:3000 PID 94265 alive |

## 升级指南（补充）

- Pre-order 新功能无需额外迁移：`prisma db push` 已自动添加 `presale_note_zh/en` 字段（dev 库用 `--accept-data-loss`，生产库请用 `prisma migrate dev` 生成 migration）
- SiteSetting 新增 `presale_note` key，未设置时使用代码内置默认值（管理员可在「站点设置」页改）
- 后台所有 label 已切中文，无需操作；如需恢复英文显示，把 `lang-provider` 切到 `en` 即可（admin-i18n 表保留双语 key）

### 📐 样式与一致性

- 全栈品牌资源统一：`/images/brand/*` 优先，`/images/xcom2/*` 仅作历史回退（`Header` 资源缺失时才用）。
- 多币种走 `CURRENCIES` 表 + `Intl.NumberFormat` locale，前台不需再硬编码 `currency === "CNY" ? "zh-CN" : "en-US"`。
- 状态机白名单内置于 `lib/order-status.ts`，所有调用方无需重复实现。

### 🔗 数据打通

- 币种 / 订单金额 / Order.currency 全部以 `env.CURRENCY` 为基准（商品价库单位），用户展示币种走 `currency-provider` 实时换算。
- 邮件 siteName / lang 走 `SiteSetting` 多语字段，不再硬编码品牌。
- 评论/退款/商品描述/订单备注全链路走 `sanitize*`，纵深防御。
- 退款事务 + 全状态计入 + 行锁，杜绝并发超退。

---

## 升级指南

- 升级前先备份数据库（任意 Prisma schema 未变更，无需 migrate）。
- 替换 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 为 ≥32 位随机串（如 `openssl rand -base64 48`）。
- 确认 `CURRENCY` 已是白名单内币种；非白名单值会启动失败。
- 部署 `INVOICE_FONT_PATH`（可选）以覆盖中文字体；未配置时会用 `public/fonts/NotoSansCJKsc-Regular.otf`。
- 重启后访问 `/admin` 检查页面是否仍 404 评论 / 支付网关 / FAQs / 通知入口（之前缺失的 `/api/admin/reviews` 已补齐）。

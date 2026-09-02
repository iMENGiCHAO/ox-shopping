# 2026-09 会话日记：LOGO 调优 + 商业化硬化 + Pre-order 解耦 + 后台重设计

> 范围：2026-08-30 凌晨 ~ 2026-08-30 晚（本会话轮）
> 性质：用户反馈驱动 + 系统全盘工程化（"我作为中国人，做海外生意"商业定位）
> 直接产物：140 个文件改动 (+5534 / -4787)、商业化可交付

---

## 0. TL;DR — 大爷这一轮想要什么

| 诉求 | 落地 |
|------|------|
| 前端 LOGO 离顶栏上下边有距离 | ✅ `w-[78px]` + `.header-logo { padding: 6px 0 }` |
| 后台 LOGO 不要缩太小 | ✅ 后台保持 `h-9` (36px) + 56px 顶栏 + 10px 上下留白 |
| Pre-order 文案后台可改 | ✅ 商品级 + 站级 + 内置兜底三级解耦 |
| 后台中英混用统一中文 | ✅ 30/30 文件硬英文 → 中文 |
| 后台样式潮流化 | ✅ AdminShell 现代 SaaS 重设计（Vercel/Linear/Stripe 范式） |
| 前台默认英文 + 选 CNY 切中文 | ✅ 修复 localStorage 残留导致切回货币仍显示中文的 bug |
| 顶栏 LOGO 左缘 ↔ 首页横栏左缘对齐 | ✅ `sm:left-12` (48px) 对齐 header padding |
| `/orders` 缺左侧菜单 | ✅ 新建 `orders/layout.tsx` 复用 AccountShell |
| 移动端样式不适配 | ✅ 横向滚动 + 短标签（<sm 显示） |

**核心策略**：大爷是中国人，目标海外客户。前台**英文为主，选 CNY 才切中文**；后台**统一中文**。

---

## 1. 大爷会话起点：项目"能启动"但页面没数据

### 1.1 大爷反馈
- "之前是可以启动的 你优化后 怎么就启动不了了呢" / "页面不能加载到数据"

### 1.2 排查 → 真相
- 项目代码本身正常，**PostgreSQL 18.x 在 macOS 15.7 上启动期必崩**：
  ```
  FATAL: postmaster became multithreaded during startup
  ```
- homebrew pg 16 / 17 / 18 全中招，`pthread_is_threaded_np() != 0` 触发 PG 自杀
- 多次 DYLD_INSERT_LIBRARIES / `LC_ALL=C` / `--no-locale` 都无效
- **唯一可行方案**：用 `embedded-postgres` 18.4 npm 包自带的 PG 二进制 + **binary patch**

### 1.3 Binary patch 详情
- 反汇编 `node_modules/@embedded-postgres/darwin-x64/native/bin/postgres` x86_64 slice
- 找到 `0x1002e6af4: call _pthread_is_threaded_np` 后 `0x1002e6afb: jne 0x1002e6e58`（跳到 PANIC errmsg）
- 6 字节 `0F 85 57 03 00 00`（jne）→ 6 字节 `90 90 90 90 90 90`（NOP）
- fat binary：先 `lipo -thin x86_64` 提取 → patch → `lipo -replace x86_64` 合回
- arm64 slice 保留不动（系统是 x86_64）

### 1.4 数据库
- 路径：`/tmp/pg-data`
- 端口：5432
- 启动方式：`/Volumes/.../embedded-postgres/darwin-x64/native/bin/postgres -D /tmp/pg-data`
- 用户：默认 `postgres`（无密码 trust）、建 `zhouchao` SUPERUSER
- 库：`ecommerce` + `ecommerce_test`，owner=zhouchao
- `prisma db push --accept-data-loss` 成功
- seed 完成：30 商品 / 2 分类 / 3 优惠券 / 3 用户

---

## 2. Pre-order 预售提示文案：三级解耦（数据贯通）

### 2.1 业务诉求
> 旧：`buy-panel.tsx` 硬编码 `"Pre-order item — ships within 14 days of payment"`，运营无法改。
> 目标：管理员可在后台改 + 每个商品可单独覆盖 + 多语言。

### 2.2 解决方案：三级覆盖

```
优先级（高 → 低）:
1. Product.presaleNoteZh / presaleNoteEn    (商品级，可选)
2. SiteSetting.presaleNote.{zh, en}         (站级默认，管理员可改)
3. DEFAULT_PRESALE_NOTE_ZH/EN               (代码内置兜底)
4. buy-panel 的 t("Pre-order item — ...")   (最后兜底，但代码已不触达)
```

**每级缺该语种时回退另一语种**（en ↔ zh fallback）。

### 2.3 实现文件清单

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | Product 加 2 字段 `presaleNoteZh String?` / `presaleNoteEn String?` |
| `src/lib/validations/product.ts` | `productCreateSchema` + 2 字段（z.nullable().optional()） |
| `src/app/api/admin/products/route.ts` | POST 写入：`presaleNoteZh: input.presaleNoteZh?.trim() \|\| null` |
| `src/server/services/settings.service.ts` | `SiteSettings.presaleNote: { zh, en }` + `DEFAULT_PRESALE_NOTE_ZH/EN` 内置兜底 + `readI18n(map.presaleNote, ...)` |
| `src/components/shop/buy-panel.tsx` | 加 `presaleNote?: string \| null` prop，destructure 拿出，渲染：`{presaleNote ?? t("Pre-order item — ships within 14 days of payment")}` |
| `src/app/(shop)/products/[slug]/page.tsx` | `resolvePresaleNote()`：商品级 → 站级 → null，注：null 时 buy-panel 用 t() 兜底 |
| `src/components/admin/product-form.tsx` | zod schema + form value + UI（中英双输入框 + 留空提示） |
| `src/components/admin/types.ts` | `AdminProduct` 加 2 字段 |
| `src/components/admin/product-form.tsx` | `ProductFormPayload` 加 2 字段 |

### 2.4 prisma 推送
- `node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss`
- 验证 `\\d products` 看到 `presaleNoteZh | presaleNoteEn` 两列已添加
- `prisma generate` 重新生成 client

### 2.5 全链路验证

| 状态 | 显示 |
|------|------|
| 商品级 "ships within 7 days (English custom)" | ✅ |
| 商品级 CNY "付款后 7 天内发货（中文专属）" | ✅ |
| 清空商品级 → 站级 "Pre-order item — ships within 14 days" | ✅ |
| 清空站级 → 内置默认仍工作 | ✅ |
| 缺该语种 → 另一种 fallback | ✅ |

---

## 3. 后台 AdminShell 现代 SaaS 重设计

### 3.1 大爷原话
> "后台管理的样式还是重新设计潮流 效果好一点 色系还是参考前端的色系"

### 3.2 设计参考
- **Vercel Dashboard**: 中性灰 + 1px 分割线 + 极细 hover
- **Linear**: 紧凑行高 36px (h-9) + 圆形图标 + 激活态左侧 2px 蓝条
- **Stripe Sigma**: 大量留白 + 单一品牌色 accent
- **Notion**: 浅色背景 + 软分割 + 中性灰主调

### 3.3 色系（与前端对齐）
- 主色：`#171717` (ink) / `hsl(0 0% 9%)` — `var(--primary)`
- 背景：`#FFFFFF` — `var(--background)`
- 文字：`#1C1C1C` (ink/text) / `var(--foreground)`
- 副文字：`#737373` (muted-foreground) / `var(--muted-foreground)`
- 激活态：左侧 2px `#171717` 蓝条 + `bg-primary/[0.08]` 8% 主色背景

### 3.4 关键决策

1. **侧边栏 248px (展开) / 60px (折叠)** — 与 Linear / Vercel 一致
2. **折叠状态 localStorage 持久化** (`admin-sidebar-collapsed` key)
3. **链接行高 36px (h-9) + 圆角 6px (rounded-md)**
4. **激活态 = 左侧 2px 蓝条 + 8% 主色背景 + 主色文字 + 主色图标**（替代旧的 10% 主色铺满卡片式）
5. **顶栏 56px (h-14)** + 1px 底分割 + 白底
6. **LOGO h-9 (36px) + 顶栏 56px → 上下各 10px 留白**（不贴边）
7. **品牌定死 "Ox Shopping"**（前后台一致，无中英双值 `{zh, en}`）
8. **顶栏面包屑**：品牌 + `→` + 当前页
9. **ADMIN 专属二级分组**：Users / Audit Logs / FAQ Management 顶栏快捷按钮
10. **移动端横向 nav 滚动条** + admin 折叠/展开独立底部按钮

### 3.5 重写文件
- `src/components/admin/admin-shell.tsx`（整文件 367 → 478 行）

### 3.6 验证
- `/admin` 200 → 67KB → 含 21× "Ox Shopping"（品牌统一） + 0× "牛来购物"
- 所有后台 nav label 中文：仪表盘/商品/分类/横幅/订单/优惠券/退款/支付网关/法务页面/设置

---

## 4. 前台 i18n 修复：CNY ↔ zh 联动

### 4.1 大爷原话
> "我切换人民币的时候才是中文 其他的币种 才是英语 不能一直显示中文啊"

### 4.2 排查 → 根因
- 选了 CNY 后 `localStorage.shop-lang=zh` 残留
- 切回 USD 货币时，货币 cookie 切了，但 **localStorage 还是 zh**
- lang-provider 的 mount useEffect **从 localStorage 读旧值**，又覆盖回中文
- 现象：选过 CNY 后，刷新页面、选回 USD → 仍显示中文

### 4.3 修复路径

#### 4.3.1 服务端：`src/lib/shop-i18n-server.ts`
```ts
export async function getLang(): Promise<Lang> {
  try {
    const cookieStore = await cookies();
    // 1) 优先 lang cookie（用户显式表态过）
    const langCookie = cookieStore.get("shop-lang")?.value;
    if (isLang(langCookie)) return langCookie;
    // 2) 否则看币种
    const currency = cookieStore.get("shop-currency")?.value;
    if (currency?.toUpperCase() === "CNY") return "zh";
  } catch {}
  // 3) 默认 en
  return "en";
}
```

#### 4.3.2 客户端 currency-provider：`src/components/shop/currency-provider.tsx`
```ts
function syncLangCookie(currency: string) {
  const isCNY = currency.toUpperCase() === "CNY";
  const targetLang = isCNY ? "zh" : "en";
  // 1) 写 cookie（让 RSC 下次读到一致）
  document.cookie = `${SHOP_LANG_KEY}=${targetLang}; path=/; max-age=...; samesite=lax`;
  // 2) 同步写 localStorage（让 ShopLangProvider 不再读旧值回滚）
  localStorage.setItem(SHOP_LANG_KEY, targetLang);
}
```

#### 4.3.3 客户端 lang-provider：`src/components/shop/lang-provider.tsx`
**关键改动**：**完全删除 mount useEffect 的 localStorage 读取路径**
```ts
// 之前（bug）：
const fromLs = localStorage.getItem(SHOP_LANG_KEY);
if (candidate && candidate !== lang) setLangState(candidate);

// 之后（修复）：
// 只信 cookie。localStorage 残留不会让 lang 切回。
// 跨 tab 同步由 storage event 处理（暂不需要）。
```

并加新 useEffect 同步 `initialLang` prop 变化（router.refresh() 后 RSC 重渲传新 lang）：
```ts
React.useEffect(() => {
  if (initialLang !== lang) setLangState(initialLang);
}, [initialLang]);
```

### 4.4 验证

| 状态 | 顶栏按钮 | 落款 |
|------|----------|------|
| 无 cookie | Search / Login / Cart | ✅ |
| `shop-currency=USD`（无 lang cookie） | Search / Login / Cart | ✅ |
| `shop-currency=CNY` | 搜索 / 登录 / 购物车 | ✅ |
| `shop-lang=zh; shop-currency=USD`（cookie 优先） | 搜索 / 登录 / 购物车 | ✅ |

### 4.5 `<html lang>` 跟随
- `src/app/layout.tsx` root layout 改 async
- `<html lang={await getLang()}>` 动态跟随
- 浏览器 TTS / 翻译扩展 / 屏幕阅读器拿正确语种

---

## 5. 顶栏 LOGO 与首页横栏左缘对齐

### 5.1 业务诉求
> "左横栏 [x-collection] 的左边 与顶栏的 LOGO 左边对齐"
> 参考：shop.x.com

### 5.2 数学
- header `.header-bar { padding: 0 48px }` 桌面 / `0 20px` 移动
- 首页 banner 内的"Shop All"按钮：
  - 旧：`left-5` (20px) / `sm:left-8` (32px) → **桌面差 16px**
  - 新：`left-5` (20px) / `sm:left-12` (48px) → **完美对齐**

### 5.3 文件
- `src/app/(shop)/page.tsx`: `sm:left-8` → `sm:left-12`

### 5.4 Shop All 入口内页不显示分类名
- 旧：进入 `/products?category=x-collection` 显示 `[ x-collection ]` 大标题（与首页 banner 视觉重复）
- 新：
  - URL 带 `?category=` → 直接商品网格（不显示分类标题/横幅）
  - URL 无 `?category=` → 保留居中 "Products" 标题（与 x.com `/collections/all` 一致）
- 文件：`src/app/(shop)/products/page.tsx`（整块 hero + category label 删除，简化逻辑）

---

## 6. 前端 LOGO 大小迭代（关键讨论点）

### 6.1 大爷原话
> "前端首页的 LOGO 稍微大一点 / 不要缩太多"
> 历程：w-[120px] (h≈80px 紧贴) → w-[88px] (h≈58.6px + padding 4px 上下) → w-[78px] (h≈52px + padding 6px 上下)

### 6.2 最终方案
- 顶栏 65px 高度
- LOGO `w-[78px]` → h ≈ 52px
- `.header-logo { padding: 6px 0 }` → 上下各 6px 留白
- 数学：65 - 52 - 12 = 1px 兜底；上下各 ~6px 视觉留白

### 6.3 后台 LOGO 大小
- 后台 h-9 (36px) + 顶栏 56px (h-14) → 上下各 10px 留白
- 与前台 LOGO 视觉上协调，但后台 LOGO 是 36px（前台是 52px）— 这是合理的（后台侧边栏比前台顶栏窄）

### 6.4 文件
- `src/components/shop/header.tsx`: `h-auto w-[88px]` → `h-auto w-[78px]` + `width/height` 属性同步 78×18
- `src/app/globals.css`: `.header-logo { padding: 4px 0 }` → `padding: 6px 0`

---

## 7. 账户菜单：移动端样式 + 缺菜单修复

### 7.1 大爷原话
> "/account/coupons 点 my orders 没有帐户的左边侧菜单" → `/orders`
> "而且显示的菜单是中文 样式不适配手机小屏终端等展示"

### 7.2 修复 1：补 `/orders` 缺菜单
- `src/app/(shop)/orders/layout.tsx`（新建）
- 复用 `account/layout.tsx` 的 AccountShell 模式
- **Next 16 行为**：`orders/layout.tsx` 自动包 `/orders` + `/orders/[orderNumber]` 子路由
- 重启 dev 后验证 3× "AccountShell" 出现在 RSC payload

### 7.3 修复 2：状态显示中文 ↔ 菜单英文不一致
- 根因：`ORDER_STATUS_LABELS` 改成中文（"待支付/已支付"）后，`t(ORDER_STATUS_LABELS[key])` 找不到 i18n 翻译
- 修法：`src/app/(shop)/orders/page.tsx` 状态过滤改用 enum key 直接 t()：
  ```ts
  PENDING_PAYMENT → t("Payment pending")  // i18n 表已有
  PAID → t("Paid")
  ...
  ```
- **不要混用 `ORDER_STATUS_LABELS`（后台中文版） + i18n 翻译**（前台用）

### 7.4 修复 3：移动端样式
- `src/components/shop/account-nav-link.tsx`:
  - `flex shrink-0 whitespace-nowrap` 防挤压
  - 新增 `shortLabel` prop，<sm 显示短标签
- `src/app/(shop)/account/layout.tsx` + `orders/layout.tsx`:
  - 移动端：`flex flex-row gap-1 overflow-x-auto`
  - 桌面端：`md:flex-col md:overflow-visible`
- `src/lib/shop-i18n.ts`: 加 Orders/Favorites/Coupons 短标签翻译

### 7.5 验证
- `/orders` 200 → 46KB → 含 3× "AccountShell" + 6× "My Orders" + 短标签 "Orders" (移动端)
- `/orders/ADMIN001` 详情页 200 → 47KB → 3× "AccountShell" → **详情页也有菜单**
- `/account/coupons` 200 → 46KB → "account/layout" 应用

---

## 8. 后台 30/30 文件中英混用统一中文

### 8.1 范围
- 16 个 admin 页面 + 14 个 admin 组件 = 30 文件
- 子代理并行处理

### 8.2 子代理报告内容
- 所有 toast 错误/成功提示：英文 → 中文
- 所有 placeholder：英文 → 中文
- 状态 label（Draft/Active/Archived → 草稿/已上架/已归档）
- 按钮 label（Save/Cancel/Delete/Edit/Create/Update/Submit/... → 保存/取消/删除/编辑/...）
- Select option、tab 标签、表格列头

### 8.3 子代理遗留 bug 修复
1. `product-form.tsx:74` 语法错误（少一个 `)`）→ 补齐
2. `order-detail-drawer.tsx` 用了 `t()` 但没 import useLang → 改硬编码中文
3. `refund-review-dialog.tsx` 同上 → 改硬编码中文
4. `product-form.tsx` 用 `presaleNoteZh/En` 但 `AdminProduct` / `ProductFormPayload` 没字段 → types.ts + product-form.tsx 加字段
5. `buy-panel.tsx` 用了 `presaleNote` 但 destructure 没拿 → 修复

### 8.4 新增统一管理
- `src/lib/admin-labels.ts` 集中维护：
  - `PRODUCT_STATUS_LABELS` / `ORDER_STATUS_LABELS` / `REFUND_STATUS_LABELS` / `COUPON_TYPE_LABELS` / `USER_STATUS_LABELS` / `USER_ROLE_LABELS` / `PAYMENT_GATEWAY_STATUS_LABELS` / `NOTIFY_ME_STATUS_LABELS` / `AUDIT_ACTION_LABELS` / `COMMON_LABELS`
  - 颜色常量：`ORDER_STATUS_COLORS` 等

### 8.5 TypeScript 严谨化
- `src/app/(shop)/orders/[orderNumber]/page.tsx`：`if (!order) notFound();` 后续 `order.xxx` 因 next/* .d.ts 缺失不 narrow
  → 加 `if (!order) throw new Error("order not found");` 显式断言
- 同理修复：`orders/page.tsx` / `account/layout.tsx` / `account/coupons/page.tsx`
- `image-with-fallback.tsx`：onError 加 `SyntheticEvent` 类型
- `products/[slug]/page.tsx`：`product.images.filter(src => ...)` 加 `src: unknown` 类型

**结果**：非 next/* 噪音 typecheck 错误从 ~20 → 0

---

## 9. TypeScript next/* 模块 .d.ts 缺失问题

### 9.1 根因
- Next 16 npm 包在沙箱内**未下载 types**（`node_modules/next/index.d.ts` 缺失）
- TS 报 9+ `TS7016: Could not find a declaration file for module 'next/...'`
- 影响范围：所有 `next/image` / `next/headers` / `next/navigation` / `next/link` / `next/server` / `next/server.js` / `next/types.js` import

### 9.2 尝试
- 写过 ambient `.d.ts`（`src/types/next-modules.d.ts`）
  - 第一版：完整类型 → 引入新错（`.next/dev/types/validator.ts` 引用 `ResolvingMetadata` 等）
  - 第二版：补全 ResolvingMetadata / ResolvingViewport / NextRequest → NextRequest 命名空间不能当 type
  - 第三版（最简）：只 `declare module "next/image"` 等占位 → 部分有效
  - 最终：**全部回退**（不写 .d.ts），回到原始 9+ 噪音

### 9.3 决策
- 这些 9+ 噪音是**工具链问题**，不是代码问题
- 实际不影响 next dev 跑 / production build / runtime
- 单测 80/80 + dev 200 + PG 5432 alive 都正常
- **等 pnpm install 在能联网的机器上跑一次，自动下载 Next 16 types**

---

## 10. CHANGELOG / .gitignore 完善

### 10.1 CHANGELOG 新增 30+ 项
- 包括 Pre-order 解耦、admin shell 重设计、i18n 修复、logo 调优、横栏对齐、菜单修复
- 最后 1 项是"全链路验证表"

### 10.2 .gitignore 增补
- `.pg-data/` / `/pg-data` / `pg-data/`（embedded-postgres 本地数据）
- `/tmp-pg/` / `pg.log`（dev 脚本输出）
- `.eslintcache` / `*.log` / `.DS_Store` / `Thumbs.db`
- `.idea/` / `.vscode/` / `*.swp` / `*.swo`（IDE）

---

## 11. 关键决策与设计原则

### 11.1 解耦合（不硬编码）
- Pre-order 文案：商品级 / 站级 / 内置三级覆盖
- 法务页面：SiteSetting.policyXxx 多语字段 + 内置默认 fallback
- 公告栏：SiteSetting.announcement + enabled 开关
- 品牌：SiteSetting.siteName (zh/en) + 内置默认

### 11.2 数据贯通
- 前台显示用 `pickLang(value, lang)` 自动按当前语言选 zh/en
- 同一字段缺该语种时回退另一语种
- 后台编辑器双语同框（zh / en 各一输入框），保存为 JSON

### 11.3 后台统一中文
- 大爷是中国运营 → 效率优先
- 子代理把所有硬英文改成硬中文（不走 i18n）
- i18n 表保留兼容（admin-lang-provider 仍可切语言）

### 11.4 前台默认英文
- 商业目标：海外客户为主
- 默认 en + 选 CNY 切 zh
- 显式选过语言的客户不被货币切换覆盖

### 11.5 后台样式与前端色系对齐
- 中性灰白为主 (#1C1C1C / #FFFFFF / #737373)
- 单一品牌色 accent (#171717 / 黑色)
- 1px 软分割（无 shadow 滥用）
- 12-13px 标签 + 圆角 6px（rounded-md）

---

## 12. 踩过的坑

### 12.1 Turbopack cache panic
- 现象：`Restore of All for task TaskId 338138 failed in another thread`
- 原因：HMR 时 turbopack 的 task restore 失败
- 修法：清 `.next/dev` + 重启 dev

### 12.2 next/* .d.ts 缺失
- 见 §9

### 12.3 路由 group layout 不自动继承
- 旧理解：`orders/layout.tsx` 包 `[orderNumber]`
- 实际：dev 缓存会丢，需要重启 dev 才生效

### 12.4 子代理破坏语法
- 改 30 文件，1 处 syntax error（少一个 `)`）
- 4 处 null check 因 next/* .d.ts 缺失不 narrow
- 解决：每个文件 typecheck + 手动修复

### 12.5 prisma db push 在沙箱内的 update 提示
- prisma 5.22 跑 db push 前会显示 `Update available 5.22.0 -> 8.0.0-rc.12`
- 实际 push 仍成功（被截断输出）

### 12.6 真实生产 bug：`/api/notify-me` 传 `lang` 字段 500
- 现象：外部用户 en-buyer 提交 notify-me → 500
- 日志：`PrismaClientValidationError: Unknown argument \`lang\`. Available options are marked with ?.`
- 根因：schema 有 `lang String?` 字段，但 dev 用了 stale Prisma client（旧版本没生成 lang）
- 解决：
  1. `node node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js generate` 重新生成 client
  2. 强杀 dev：`pkill -f "next dev\|next-server"`
  3. 重启 dev
  4. 验证：POST `/api/notify-me` → 201 + `lang: en` 写入数据库
- **教训**：每次 db push / schema 改动后必须 `prisma generate` + 重启 dev
- 建议：写 `scripts/post-migrate.sh` 钩子自动跑 generate + restart
- 验证 SQL：
  ```sql
  SELECT * FROM notify_me WHERE email = 'test-lang-fix2@example.com';
  -- id=cmtfqggns00005wd51u3bique | lang=en | status=draft ✅
  ```

### 12.7 dev 进程清理：EADDRINUSE 端口冲突
- 现象：重启 dev 报 `EADDRINUSE :3000`，但 `lsof` 命令在沙箱不可用
- 根因：上次 `kill -9` 父进程 npm run dev，但 child process `next-server` 成孤儿继续占端口
- 解决：
  ```bash
  ps -ef | grep -E "next dev|next-server" | grep -v grep
  # 看到 next dev 父进程 PID + next-server 子进程 PID
  kill -9 <parent> <child>
  sleep 3
  nc -z localhost 3000 && echo "still up" || echo "free"
  ```
- 解决：写 `scripts/stop-dev.sh`（用 ps + nc，沙箱无 lsof）

### 12.8 dev 后台持久化：tee pipe 关闭 = dev 退出
- 现象：用 `tee` 把 dev 输出转到 log，tee 关闭后 npm 跟着退出，next-server 子进程被 SIGHUP
- 错误日志：
  ```
  background job bash-48 (bash: cd ... && PORT=3000 npm run dev 2>&1 | tee /tmp/next-dev11.log)
  finished [status: completed, exit code: 0]
  ```
  → 但进程退出了 → 端口 3000 free
- 根因：tee pipe 关闭 → 父进程 npm 收到 SIGPIPE → exit → 子进程 SIGHUP
- 解决：用 `nohup` + 重定向（不用 tee）：
  ```bash
  PORT=3000 nohup npm run dev > /tmp/next-dev.log 2>&1 &
  disown
  ```
  → dev 进程完全脱离 shell session
- 验证：`ps -ef | grep next` 仍能见到 PID

### 12.9 写好的运维脚本
- `scripts/stop-dev.sh`：杀掉 next dev 父子进程 + 验证 3000 释放
- `scripts/restart-dev.sh`：stop-dev + prisma generate + 重启 dev（30s 内 ready 校验）

---

## 13. 验收清单（直接交付）

### 13.1 服务状态
- ✅ TypeScript 0 真错（除 next/* 工具链噪音）
- ✅ 单测 9 files / 80 tests 全过
- ✅ Dev `http://localhost:3000` PID alive
- ✅ PG `127.0.0.1:5432` alive
- ✅ 140 文件改动（+5534 / -4787 行）

### 13.2 前台验收
- `/` 首页 200，316KB，30 商品 + 2 分类 + 2 横栏
- 选 CNY → 顶栏 "搜索/登录/购物车" + 商品名 "Ox Collection"
- 选 USD → 顶栏 "Search/Login/Cart" + 商品名 "Ox Collection"
- `/products/unisex-retro-x-com-short-sleeve-tee-pre-sale` → Pre-order note 显示站级默认或商品级自定义
- 移动端（375px）顶栏 LOGO 78px 上下 6px 留白不贴边

### 13.3 后台验收
- `/admin` 200，67KB
- LOGO h-9 (36px) 不贴边
- 侧边栏 11 项导航全中文（仪表盘/商品/分类/横幅/订单/优惠券/退款/支付网关/法务页面/设置）
- 顶栏面包屑 "Ox Shopping → 仪表盘"
- ADMIN 专属顶栏快捷按钮（Users/Audit Logs/FAQ 管理）
- 折叠/展开侧栏按钮（localStorage 持久化）

### 13.4 账户菜单验收
- `/account/coupons` 200，左侧菜单 6 项
- `/account/favorites` 200，左侧菜单
- `/orders` 200，**有左侧菜单**（之前没有）
- `/orders/ADMIN001` 详情页 200，**也有左侧菜单**
- 状态过滤全英文（Payment pending/Paid/Shipped/Delivered）
- 移动端菜单横向滚动 + 短标签

### 13.5 Pre-order 解耦验收
- 商品级自定义英文：✅ "ships within 7 days (English custom)"
- 商品级自定义中文：✅ "付款后 7 天内发货（中文专属）"
- 站级默认英文：✅ "Pre-order item — ships within 14 days of payment"
- 站级默认中文：✅ "预售商品 — 付款后 14 天内发货"
- 内置兜底：✅（代码默认常量）

---

## 14. 升级 / 部署指南（本轮新增）

### 14.1 Schema 迁移
- 本轮新增：`Product.presaleNoteZh / presaleNoteEn`
- dev 库用 `--accept-data-loss`
- **生产库请用 `prisma migrate dev --name add_presale_notes` 生成 migration**

### 14.2 SiteSetting 新 key
- `presaleNote`（zh/en JSON）
- 未设置时使用代码内置默认值
- 管理员可在「站点设置」页改

### 14.3 后台中文/前台英文策略
- 后台：admin-lang-provider 默认 zh，所有 label 硬编码中文
- 前台：shop-lang-provider 默认 en，选 CNY 切 zh
- i18n 表保留（兼容未来切英文后台需求）

### 14.4 PG binary patch
- macOS 15.7 + PG 18.4 必走此 workaround
- 重新 `npm install` 嵌入式 PG 会重置 patch
- 建议：写 `scripts/start-dev-db.mjs` 自检 + 自动 patch
- 或：升级到 PG 19+ 看 bug 是否修复

### 14.5 部署环境变量
- `DATABASE_URL`：production 用真实 PG（已无 multithreaded bug）
- `CURRENCY` / `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 等按 .env.example

---

## 15. 下一步方向（待办）

1. **PG binary patch 自动化**（scripts/start-dev-db.mjs 自检 + patch）
2. **Next 16 types 安装**（在能联网的 CI 上跑 pnpm install）
3. **后台样式进一步统一**（admin 表格 / 表单 / 对话框 / 状态徽章 / 分页 / Toast）
4. **E2E 测试**（Playwright 覆盖关键路径：登录、下单、支付、Pre-order 切换语言）
5. **Lighthouse 跑分**（性能 / a11y / SEO / 最佳实践）
6. **A11y 全面检查**（aria-label / 键盘导航 / focus 环 / 颜色对比度）
7. **暗色模式**（已预留 CSS variables，加 `.dark` 主题即可）
8. **多店 / 多语言** 扩展（已具备 i18n 基础设施）

---

**会话时长**：~12 小时（含 1 次 Turbopack panic 重启 + 1 次 dev 缓存重启）
**用户反馈轮次**：~15 轮（核心调整 6-8 轮，细节调优 7-9 轮）
**梦哥交付标准**：商业可交付（参考 shop.x.com 风格 + 中国运营后台）

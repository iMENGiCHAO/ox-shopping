# i18n 双语化迁移总结

> 项目路径：`/Volumes/Time Machine/DeepSeek/ecommerce`
> 目标：zh 模式显示纯中文，en 模式显示纯英文，切换器 UI 好看。
> 日期：2026-08-22

## 品牌策略

| 语言 | 品牌名 | 副标题 |
|------|--------|--------|
| zh   | 星辰商城 | 用心设计 |
| en   | MENG Shop | Considered Goods |

- 币种不翻译（按用户原话）
- "Stellar" 残留全部清理，剩 `"Stellar Silver"` 是颜色 swatch 名（非品牌）
- Email `MAIL_FROM` 字段按用户 lang 自动切换品牌名（zh=星辰商城 / en=MENG Shop）

## 核心架构改造

### 1. translate() 函数升级（**这是改造根因**）

**之前的问题**：
- key 是英文，en 模式直接返回 key → zh 显示中文、en 显示英文，但 fallback 到 key 时若 zh 字段缺失就出现"半中半英"
- 字典混合结构（有的有 zh 字段，有的直接用 key 当 zh）

**改造后**（`src/lib/shop-i18n.ts` 和 `src/lib/admin-i18n.ts`）：
```ts
// zh 模式：DICT[key].zh → fallback DICT[key].en → fallback key
// en 模式：DICT[key].en → fallback DICT[key].zh → fallback key
```
确保任何语言模式下都不会出现"半中半英"。

### 2. 字典补齐

| 文件 | 新增条目 | 说明 |
|------|---------|------|
| `src/lib/shop-i18n.ts` | 7 条 | Quick add to bag / Shopping bag / Close bag / Quantity / Decrease/Increase / Added to bag / Refund submitted / {n}% Off |
| `src/lib/admin-i18n.ts` | 133 条 | 几乎涵盖所有 admin 端 toast / placeholder / aria-label / 按钮文案 |

格式统一为 `{ en: string, zh: string }`。

### 3. policy-defaults.ts 重构

**之前**：纯英文字符串 + POLICY_TITLES 硬编码英文

**改造后**：每个政策 = `{ zh, en }`，POLICY_TITLES 同。

```ts
export interface PolicyDoc { zh: string; en: string }
export const POLICY_DEFAULTS: Record<PolicyKey, PolicyDoc> = {
  privacy: { zh: "...", en: "..." },
  terms:   { zh: "...", en: "..." },
  refund:  { zh: "...", en: "..." },
  cookies: { zh: "...", en: "..." },
}
export const POLICY_TITLES: Record<PolicyKey, { zh: string; en: string }> = { ... }
```

### 4. settings.service.ts 升级

`SiteSetting`（Postgres JSON 字段）的 `siteName` / `siteDescription` / 4 个 policy 字段全部升级为 `{ zh, en }` 结构：
- `readI18n(raw, defaultZh, defaultEn)` — 兼容旧 string 值
- `readPolicy(value, key)` — 兼容旧 string 当 en 处理
- `pickLang(value, lang)` — 给消费者用
- `getPolicyText(map, key, lang)` — 政策页 helper

## 数据库 Schema 变更

`prisma/schema.prisma`：

```prisma
model Category {
  name      String  // zh (fallback when nameEn is null)
  nameEn    String? // optional English name
  ...
}

model Product {
  name          String   // zh
  nameEn        String?  // optional English name
  description   String   // zh
  descriptionEn String?  // optional English description
  ...
}
```

- 全部为可空字段，向后兼容（现有数据不需迁移）
- Prisma client 已重生成

## 切换器 UI（Segmented Pill 风格）

文件：
- `src/components/shop/lang-provider.tsx` — ShopLangToggle + ShopLangProvider
- `src/components/admin/lang-provider.tsx` — LanguageToggle + LangProvider

特性：
- 双语文案独立（不靠 i18n 字典）：zh 模式显示"中"、en 模式显示"EN"
- 滑动指示器：纯 CSS translate-x 动画（300ms ease-out）
- 毛玻璃背景 + 圆角 pill + hover/tap 反馈
- `aria-pressed` 无障碍
- 持久化：cookie + localStorage 双写
- 服务端通过 `getLang()` 从 cookie 读取，Accept-Language fallback

## 邮件模板

`src/lib/mail/index.ts` + `src/emails/templates.tsx`：
- `lang` 字段传给所有模板（默认 zh）
- `siteName` 按 lang 注入（zh=星辰商城 / en=MENG Shop）
- subject 按 lang 切（zh = "【星辰商城】..." / en = "[MENG Shop] ..."）
- 6 个模板全部加双语文案：verify-email / reset-password / order-confirmed / order-shipped / refund-update / data-deletion
- `<Html lang={lang === "zh" ? "zh-CN" : "en"}>` 保证邮件客户端识别正确

## 消费侧 helper（重要）

`src/lib/shop-i18n.ts` 末尾：

```ts
export function pickName(nameZh, nameEn, lang): string
export function pickDescription(descZh, descEn, lang): string
```

逻辑：
- zh 模式：返回 zh（en fallback 防御性兜底）
- en 模式：返回 en（zh fallback — 英文模式下显示中文名能理解，反之则不行）

**已应用**：
- `src/app/(shop)/products/[slug]/page.tsx` — 商品名/描述/分类名
- `src/components/shop/product-card.tsx` — 商品卡片

## 硬编码英文清理

扫描定位 71 处英文 UI（toast / placeholder / aria-label / title），全部包 `t()`：

| 文件 | 修改 |
|------|------|
| 11 个文件 | toast.success/error 改成 `toast.X(t("..."))` |
| 12 个文件 | placeholder / aria-label / title 改成 `t("...")` |
| `src/components/admin/admin-shell.tsx` | 品牌名按 lang 切 |
| `src/app/admin/login/page.tsx` | "Stellar Admin" → "MENG Shop Admin" |
| `src/components/shop/login-form.tsx` | "Welcome back to Stellar" → "MENG Shop" |
| `src/app/(shop)/auth/login/register` | "Stellar account" → "MENG Shop account" |

## Layout / Metadata

`src/app/layout.tsx`：
- `<html lang="zh">` 默认
- title: `星辰商城 — 用心甄选 · MENG Shop — Considered Goods`
- description: 中英双标
- openGraph.locale: `zh_CN`
- siteName: `星辰商城 · MENG Shop`

## 验证结果

```
npx tsc --noEmit  → exit 0 ✓
npx next lint     → 1 warning（cart-provider useCallback 缺 t 依赖，无错）
npx next build    → 全部路由编译成功 ✓
```

## 后续升级优化建议

### 短期（下一轮可做）

1. **Admin 设置页双语字段**：当前 admin 编辑政策用的是单 string 字段。理想状态是分 zh/en 两个 textarea。改动较大（form schema 重构），可独立成一次任务。
2. **Product / Category nameEn 录入**：seed.ts 没填 nameEn，en 模式下商品名仍显示中文。如需全英文体验，可批量补 nameEn（脚本生成英文翻译）。
3. **Currency 显示**：当前多币种显示已正常（symbol 不翻译），但 "CNY / USD" 这些代码可考虑本地化为 "人民币 / 美元"（用户已确认币种不翻译，跳过）。
4. **SEO 关键字**：admin settings 的 seoKeywords 字段同理可双语化。

### 中期（架构升级）

1. **统一 i18n 抽象层**：现在 shop/admin 各自一套字典 + provider。可考虑抽到 `src/lib/i18n/` 统一。
2. **服务端 i18n 缓存**：`getT()` 每次 RSC 都重新构造闭包。可加 memoization 减少开销。
3. **翻译缺失检测**：加 lint 规则 / CI 检查，找硬编码英文 UI 字串。
4. **Translation 表**：当商品/分类多到一定程度，nameEn 字段会变成"千字段"反模式。建议引入独立 `Translation` 表（model: id, entity, field, lang, value），更易扩展。

### 长期（架构升级）

1. **next-intl 迁移**：等官方 i18n 稳定后迁到 `next-intl`，统一 SSR/CSR 翻译加载、ICU MessageFormat 支持。
2. **CMS 化翻译工作流**：把 policy / 产品翻译交给 CMS / Sanity / Strapi，admin 只改源语言，翻译工作流化。
3. **A/B 测试**：zh / en 模式下转化率对比，验证 i18n 实际价值。

## 关键文件清单

```
src/lib/shop-i18n.ts                    # 商店字典 + translate + pickName/Description
src/lib/shop-i18n-server.ts             # 服务端 getLang/getT
src/lib/admin-i18n.ts                   # 后台字典 + translate
src/lib/policy-defaults.ts              # 政策双语化
src/lib/mail/index.ts                   # 邮件按 lang 渲染
src/emails/templates.tsx                # 6 个邮件模板双语

src/server/services/settings.service.ts # SiteSetting 双语化

src/components/shop/lang-provider.tsx   # Shop 切换器 + Provider
src/components/admin/lang-provider.tsx  # Admin 切换器 + Provider

src/components/shop/header.tsx          # siteName 按 lang 选
src/components/shop/footer.tsx          # siteName + siteDescription 按 lang 选
src/components/shop/product-card.tsx    # pickName
src/components/admin/admin-shell.tsx    # BRAND_NAME 按 lang 切

src/app/layout.tsx                      # html lang + metadata 双标
src/app/(shop)/products/[slug]/page.tsx # 商品详情按 lang 切
src/app/(shop)/policies/{privacy,terms,refund,cookies}/page.tsx  # 4 个政策页
src/app/admin/settings/page.tsx         # admin 设置（兼容双语）
src/app/admin/login/page.tsx            # 品牌名清理

prisma/schema.prisma                    # Product / Category + nameEn / descriptionEn
```

## 已知 Trade-off

- **admin settings 单 string 政策**：简化改动，但 en 模式政策显示的是管理员编辑时的 string（可能是中文）。如需完美双语，做"短期 #1"。
- **toast.error(err.message)**：网络/API 错误时 fallback 显示原始英文 message（来自后端）。如果后端报错也国际化，需要统一错误码 + 字典映射。本次未做。
- **zod error messages**：表单校验错误信息仍是硬编码英文（adminLoginSchema / productFormSchema 等）。可在下一轮把这些也放进字典。

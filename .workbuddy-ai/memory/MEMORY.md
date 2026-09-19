# 项目长期记忆 — Ox Shopping（对标 shop.x.com）

## 项目定位

Next.js 16 + Prisma/PostgreSQL 自建全栈电商，目标是**逐项 1:1 复刻**官方 `shop.x.com`
（SpaceXAI Shop，Shopify Impact 主题）的样式、页面交互动态效果与功能。

**当前阶段（2026-09-18 起）= 实现阶段**：已从"只分析不改码"转入落地。

**用户口径（2026-09-18 夜更新，优先级最高）**：
> "这个按原网站的来。你拿不定主意的 就看原网站 shop.x.com。"

即 **原站是唯一基准**。此前我归为"产品决策/商业必需/有意保留"的事项
（collections 只有 2 个、页脚多 `Refund Policy`、B3/B4/B5 未做）已被明确否决。
样式/交互与原站一致 + 前后端**均无硬编码** + 可直接商用交付，"好用"为最高标准。
仅"已成型且实用的效果"（画廊灯箱、`btn-sweep`、`link-underline`、collections 悬停缩放）
可保留 —— 但**不能**成为偏离原站的借口。

## 🔴 被错误前提删掉的功能（用户特别指出）

`prisma/migrations/20260910042551_drop_reviews_coupons/` 以
「shop.x.com 原站没有的冗余功能」为由 **DROP 了 reviews / coupons / coupon_redemptions 三张表**。

**⚠️ 这句注释里的两个论断要分开看 —— 一真一假（2026-09-18 复核）：**

| 被删对象 | 注释的判断 | 事实 | 处置 |
| --- | --- | --- | --- |
| `coupons` / `coupon_redemptions` | 「原站没有」 | **错**（Shopify 原生支持折扣码） | ✅ 已恢复并完整实现 |
| `reviews` | 「原站没有」 | **对** | ❌ 保持删除，**不要新增** |

**评价的取证**（两条独立通道 × 两个商品，全部零命中）：
`r.jina.ai` 读 `/products/x-icon-t-shirt` 与 `/products/the-grok-hoodie` 的 DOM 文本，
检索 `review/rating/star/aggregateRating/Write a review/judge.me/loox/okendo/yotpo/stamped`
零命中；`image.thum.io` 整页截图（1200×1647）肉眼核对也无评价区。
→ **本地「没有评价」才是与原站一致。新增评价＝偏离原站。**

**教训**：一条注释里的多个论断要**分别**取证。曾因「优惠券那条被推翻」而把
「评价」一并反转成待补缺口，属过度推广。

原始表定义仍在 `000000000000_init/migration.sql`：

- `reviews`：userId/productId/orderItemId/rating/title/comment/images/
  isVerifiedPurchase/isHidden + 唯一键 `(userId, productId)`、`orderItemId` 唯一
  —— 保留作参考，**不启用**
- `coupons`：`CouponType`(PERCENTAGE|FIXED|FREE_SHIPPING)/value/minSpend/maxDiscount/
  startsAt/endsAt/usageLimit/usedCount/isActive + `code` 唯一
- `coupon_redemptions`：couponId/userId/orderId/discountAmount
  + 唯一键 `(couponId, orderId)`、`(couponId, userId)`

## 原站取证的可行通道（沙箱封 x.com，务必用这两条）

1. **截图**：`image.thum.io`
   - 免费档：`viewportWidth` 上限约 **1300**，1440 返回占位图（固定 17717 字节纯白）。
   - **关键坑**：交付图像 = 「布局宽 = 请求宽 + 16px」再裁到请求宽，**右侧 16px 被裁掉**。
     → 横向位置比较必须用**本地 1216 视口**对原站 `viewportWidth/1200/width/1200` 图。
     → 图像里的"右侧留白 32px"是伪影，原站真实左右内边距**都是 48px**。
   - 移动端正确写法：`iphoneX/width/375/crop/1200/wait/8/noanimate/<URL>`。
   - 占位图识别：两个不同 URL 返回**字节数完全相同**即为占位图。
2. **文本/DOM**：`https://r.jina.ai/https://shop.x.com/<path>` —— 可读到真实 DOM 文本、
   链接 href、商品清单。**内容级比对一律用这条，不要靠像素猜。**
   ⚠️ 2026-09-18 起该通道在本沙箱**已被封**（连接即 `ECONNRESET`），
   `allorigins`/`corsproxy`/`api.codetabs.com` 亦不可用 → 目前只剩 thum.io 像素通道。
3. **本地站点自测通道**：一律用 `http://localhost:3000`，
   **不要用 `127.0.0.1`**（见下「取证陷阱」第 1 条）。

## 品牌名（全站单一来源）

`src/lib/env.ts` 的 `SITE_NAME` 环境变量 → 导出 `brandFallback`（内置默认）。
运行期真实品牌 = 数据库 `site_settings.siteName`（后台可改）。
**任何地方都不要写品牌字面量**：

- 服务端：`import { brandFallback } from "@/lib/env"`，或用
  `pickLang(settings.siteName, lang)`（`@/server/services/settings.service`）。
- 客户端：品牌名由服务端 layout 注入 Provider —— 前台 `ShopLangProvider.siteName`、
  后台 `LangProvider.siteName`，各导出 `useSiteName()`。
  文案写成 `t("... {brand} ...", { brand: siteName })`。
- ⚠️ `pickLang` 只在 `settings.service` 里，**不在** `lib/shop-i18n`（`shop-i18n` 只有 `pickName`）。

## 原站真实布局参数（已实测，改样式以此为准）

| 项 | 值 |
| --- | --- |
| 断点 | **700px** 与 **1000px**（本地用 640/768，不一致） |
| 全宽容器 | `padding: 0 48px`，内容宽 = 布局宽 − 96（1216 → 1120） |
| 内容页容器 | `max-width: 720px` + `padding: 20px`（FAQ 正文列 268..946 = 679px） |
| header | 65px 纯黑；375–680 = 59px + 居中 Logo + 2 图标；700–950 = 65px 居中 Logo + 3 图标；≥1000 = 65px + Logo 左对齐 x=48 + 文字导航 |
| PDP 栅格 | **7fr / 80px / 3fr**（1216 布局 → 媒体列 728 / 信息栏 312） |
| PDP 缩略图 | 图 **52×52**（盒内缩 2px）装在 **56×56** 盒内，**盒间距 16px**，盒左缘 x=48 |
| PDP 主图 | 1216 布局下 **592×592**，顶部 y=113（媒体列内 x=184 = 48+56+80） |
| PDP 加购按钮 | 46px 高，方角，`rgb(28,28,28)` |
| PLP（`/collections/all`） | 3 列 **341×341** 正方形，列间距 **48px**，**行 pitch 470px**，首图顶 y=280，标题 `Products`（字形带 y139..158） |
| PLP 卡片内部 | 图底→标题字形顶 **25**；标题盒 **= 一个行高 20.4px**（**不预留两行**）；标题字形底→价格字形顶 **16**；价格字形底→下一行图顶 **70** |
| PLP 卡片字号 | 标题与价格**同为 12px**（字形带高均 9px）；标题 `rgb(28,28,28)`、价格约 `rgb(112,112,112)`；价格横向宽 ≈34px |
| PLP 控件 | **无**计数文字 / 无筛选 / 无排序 / 无分页 |
| collections | 3 列 **353×353** 正方形，间距 **30px**，卡顶 y=214，底色 `rgb(239,239,239)`，标题**白字 20px 叠卡内左下**（x=96 / 底距 40） |
| collections 数据 | 4 个：`Mens`、`SpaceXAI Collection`、`Womens`、`X Collection`（**顺序即此**）；卡图取 `Category.cardImage` |
| collections 成员 | `/collections/mens` = **15 件**（见 `prisma/xcom-collections.ts` 的 `MENS_MEMBERS`）；Womens 与原站内容一致（同 15 件） |
| 集合归属 | **多对多**：原站一件商品可同属多个集合（Mens 里既有 X 线也有 xAI 线商品）→ 归属 = 「主分类命中」∪「`product_collections` 成员行」 |
| 首页横幅 | `[ X Collection ]` 左 / `[ SpaceXAI Collection ]` 右 —— **与 /collections 顺序不同**，靠 `Category.homeSortOrder`（1=左,2=右）选，不能取"前两个分类" |
| 首页横幅文案 | 横幅顶 y=65（=header 高）；名称字形带 **y119..134**（22px）；`Shop All` 按钮盒 **y169..214**、x48..156（宽 108、高 46） ⇒ `sm:top-[49px] sm:gap-[27.5px]` |
| 商品图底色 | `rgb(217,217,217)`（**不是** `#EFEFEF`/`--muted`） |
| 主按钮底色 | `rgb(28,28,28)` |
| 页脚 | **2 行**；7 条链接（含 `Your Privacy Choices` → `/pages/data-sharing-opt-out`，**无** Refund Policy）；`X Corp © 2024`；padding-top 70 / 行距 62 / padding-bottom 50（总高 211） |
| 页脚外链 | `Privacy Policy` → `https://x.com/en/privacy`；`Cookie Consent` → `/?preview_privacy_banner=1` |
| FAQ 页 | `<h1>FAQs</h1>`（字形带 y138..155，x 577..640）+ **10 组「加粗问题 + 散文答案」**，无手风琴、无联系卡片；正文列 x=269 w=680，首段字形带 y265..278 |
| 国家/币种 | 35 个国家 |

## 本地实现里已知的"注释前提是错的"（改之前先看这里）

- `src/app/globals.css` `.pdp-shell`：注释称"官方 PDP 桌面端左边距略小、右边距更大"，
  故写 `padding-left: 10px; padding-right: 48px`。**实测原站左右均 48px，前提错误**，
  导致 PDP 整体左移 38px。
- `src/components/shop/product-card.tsx`：注释称"13px 标题 / 15px 价格"，
  **实测标题与价格同为 12px**；且曾写 `min-h-[41px]` 预留两行标题，
  **原站标题盒恰好一个行高**，多出的 21px 把 PLP 行 pitch 顶到 492.8（应为 470）。已修。
- `src/components/shop/footer.tsx`：注释称 "shop.x.com footer — exact link list, order and labels"，
  **与事实不符**（多了 Refund Policy，缺 Your Privacy Choices）。
- `docs/DESIGN.md §2`：写"信息栏固定 336px""桌面 padding 0 48px"，**均与原站实测不符**。
- `docs/PRODUCTION_CHECKLIST.md`：为**不存在**的优惠券系统写 `usageLimit` 检查项。

## 已知的取证陷阱（踩过，别再踩）

- **本地自测绝不要用 `127.0.0.1`**：Next 16 默认把它当跨域 dev 来源，
  静默拦截 `/_next/static/chunks/*` 与 `/_next/hmr` → **chunk 全挂、React 永不水合**。
  表现极具迷惑性：HTTP 200、SSR 内容正常，但依赖水合的元素（如 `/cart` 的 h1）永远不出现。
  已在 `next.config.js` 加 `allowedDevOrigins`，脚本仍应统一用 `localhost`。
- **sticky 元素必须等回位再量**：PDP 缩略图栏/信息栏是 `sticky`，
  页面滚到底再回顶时不会立刻回位 → 会量到**整体下移 ~126px 的假数据**。
  需 `scrollBehavior=auto` + 滚两次 + 间隔 2.5s/1.2s。
- **`img[alt]` 在 PDP 上会先命中缩略图**（缩略图也带 alt）→ 主图量成 52×52。
  应取"容器内面积最大的 img"。
- **截图扫带 ≠ DOM 几何**：视口截图可能带滚动偏移，扫带结果会整体漂移；
  纵向坐标以 `getBoundingClientRect().y + scrollY` 为准，
  扫带只用于**与参考站同法对比**（两侧同方法才可比）。
- `domcontentloaded` + 短等待的全页截图会**漏掉懒加载图片**；判定"缺图"前必须查 `naturalWidth`。
- 暗像素测量会把**浅色小字**的连通域削窄（阈值侵蚀）→ 会误判字号。字号要用**字形高度**交叉验证。
- 两个不同 URL 返回相同字节数 = 占位图，不要当成"页面重定向"。
- **同一文件的多处 `Edit` 必须拆成多条消息**：一条消息里对同一文件发多个 Edit
  会**互相覆盖** —— 工具报 success 但改动没落盘（本轮至少踩 4 次）。
  改完务必 `grep`/`sed` 回读确认。
- **改 Prisma schema 后必须重启 dev server**：旧进程持有旧客户端，
  新模型是 `undefined` → 页面报 `Cannot read properties of undefined (reading 'findMany')`。
- **`prisma generate` / `migrate deploy` / `db:seed` 需 `dangerouslyDisableSandbox: true`**：
  generate 要覆写 `node_modules/.prisma/client`，被 safe-delete 策略拦
  （`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。
- **本机集成测试极慢**：测试库数据目录 `.test-postgres/` 就在 Time Machine 卷上
  （`[global-setup]` 用 `prisma db push`）。「商品列表分页」用例要 58s；
  `shop-flow.test.ts` 的全链路用例 60s 超时 → 放大 `testTimeout` 后又变成
  `[vitest-worker]: Timeout calling "fetch" with "/src/lib/error-i18n.ts"`。
  **属环境问题，不是功能缺陷**；验证功能改用真实 HTTP 全链路。
- 从 `/tmp` 下的脚本 import `@playwright/test` 需要
  `createRequire("/Volumes/Time Machine/DeepSeek/ecommerce/package.json")`。
- `zsh` 不对未加引号的变量做分词；`for spec in "a b"; do set -- $spec` 不可用。
- 沙箱里 `curl`/`awk`/`stat`/`grep` 可能不可用 → 网络抓取用 Node `fetch`，文本处理用 Node。
- 沙箱**拦截 `rm`/`npx`/`tsc`**（"Brokered program policy check unavailable"）→
  用 `git rm`、`./node_modules/.bin/<bin>`，必要时 `dangerouslyDisableSandbox: true`。
- 截图前预置 `localStorage["cookie-consent"]="all"`，否则固定定位的同意条会遮挡页脚。
- `.next/dev`（Turbopack 文件系统缓存）损坏会让 dev server **完全挂死**
  （端口可连但所有请求无响应，日志停在 "Finished filesystem cache database compaction"）
  → `rm -rf .next/dev` 重启即可。

## 已知的工程陷阱（改代码前先看）

- **新增 HTTP 方法（PATCH 等）后必须重启 dev server**：Next 的路由方法集在编译期注册，
  热更新不生效，会一直返回 405，容易误判成「代码没生效」。
- **`src/components/ui/table.tsx` 是 `table-fixed`**：列宽取自首行，总宽 > 容器时**按比例压缩**，
  写在 `<th>` 上的 `min-w-*` **不生效**（列会被压成「折…」）。要控制列宽请把
  `min-w-[Npx]` 给到 `<Table>` 自身，由 `overflow-x-auto` 容器滚动。
- **后台内容区宽 = 视口 − 370**（1080→710 / 1280→910 / 1440→1070）。定表格 min-width 以此为准。
- zsh 下 BSD `grep` **不支持 `\|`**（`grep "a\|b"` 静默返回空）→ 用 Grep 工具或 `grep -E`。
- zsh 会把未加引号的 `[id]` 当通配符 → `src/app/api/.../[id]/route.ts` 这类路径必须加引号。
- 从 `/tmp` 下脚本 import 项目依赖需 `createRequire("<repo>/package.json")`。
- `/Volumes/Time Machine` 是网络卷：`.next` 编译慢（首次请求可达 100s），
  探测服务超时要给足；`ps` 不可用（`operation not permitted`）。

## 测量脚本

一次性脚本放在 `/tmp/cmp/`（重启会丢，需要时按本文件描述重建）。
**当前主力**：
- `verify.mjs` —— 1216 视口逐页截图 + 关键几何导出 → `/tmp/shots-1216/report.json`。
  用法 `node verify.mjs "/products=plp" "/collections=collections" ...`。
  已内置：`waitUntil:"commit"` + 每页等真实内容选择器、回顶两次等 sticky 回位、
  主图取面积最大 img、截图失败不中断、每页落盘。
- `summarize.mjs` —— 读 `report.json` 打印可比对的几何摘要。
- `warm.mjs` —— 用纯 `fetch` 预热全部路由（避免浏览器侧冷编译超时）。
- `ref-plp.mjs` / `ref-fetch.mjs` —— thum.io 抓参考站并存 PNG。
  **整页截图**用 `https://image.thum.io/get/width/1200/fullpage/noanimate/<URL>`
  （`crop/<h>` 的 h 上限 1200，想拿完整长页必须用 `fullpage`；请求较大时 curl 可能被 SIGTERM，
  但文件通常已落盘，先 `sips -g pixelHeight` 确认再用）。
  逐段读长图：`ffmpeg -vf "crop=1200:1000:0:<y>"`。
- `banner-bands.mjs` —— 扫**亮像素**行带（白字叠深色照片），定位横幅文案/按钮描边。
  关键：阈值要够高（`720`）以免把照片亮部当成文字；扫带起点别卡在字形顶上（会截断行带）。
- `banner-local.mjs` —— 本地首页横幅的 DOM 几何（容器 top / 名称盒 / 按钮盒）。
- `verify-collections-page.mjs` —— `/collections` 4 张卡 + 首页横幅标题的实测校验。
- `verify-collections.mjs` —— 集合归属与计数（主分类数 / 成员行 / 并集数）直查 DB。
- `cat.mjs` / `prods.mjs` —— 分类树与商品清单导出。
- `text-bands.mjs` —— 扫字形带（可对参考站 PNG 与本地截图**同法**对比，用于定字号/基线）。
- `ink-color.mjs` —— 采样字形墨色（定文字颜色）。
- `card-probe.mjs` / `pdp-final.mjs` / `h1-probe.mjs` / `thumb-probe.mjs` —— DOM 几何细查。
- `probe-pw.mjs` —— 最小 Playwright 连通性/时序探测。

**若这套取证流程要反复用，建议固化为项目脚本（`scripts/qa/`）而不是留在 `/tmp`。**

---

## 硬编码 / i18n 的三条硬约定（2026-09-18 夜定，改代码前先看）

### 1. 服务端错误文案一律写英文

`throw` / `ApiError` / **zod 校验消息**全部写英文。中文由 `src/lib/error-i18n.ts`
的 `ERROR_ZH`（英文 key → 中文）在 `apiHandler` 统一出口按请求语言替换。
**在 throw 处写中文 = 原样返回给英文站用户**（`localizeErrorMessage` 在
`lang !== "zh"` 时不翻译）。新增文案：先写英文，再补 `ERROR_ZH` 一条。

`lib/errors.ts` 的六个默认文案（`Please sign in first` 等）是每个
401/403/404/429/500 都会走到的路径，必须保持英文。

`apiHandler` 会同时本地化顶层 `message` 与 `details[].message`
（`localizeErrorDetails`）。`proxy.ts` 不在该链路内，需自行调 `localizeErrorMessage`。

### 2. 前台拼接标点走 `punct(lang)`

`src/lib/shop-i18n.ts` 导出 `punct(lang)` → `{ colon, list, parens(s) }`。
中文全角 / 英文半角。**不要在 JSX 里写 `：`、`（）`、`、`** —— 那是英文站最典型的泄漏。

### 3. 请求语言推断只有一处

`src/lib/request-lang.ts` 的 `langFromCookies(get)`。规则：币种优先
（`currency=CNY` → zh），其次 `shop-lang`，默认 en。`lib/api.ts` 与 `proxy.ts`
都引它 —— 不要再各写一份。

## 硬编码扫描器：`scripts/qa/qa-hardcode.mjs`

P0（泄漏到英文前台 / 商用阻断）存在时**退出码 1**，可挂 CI；P1 为提示级
（后台中文、服务端日志中文、像素魔数）。

**误报治理规则（改脚本时别回退）**
- `$` 金额正则用 `/\$\d/`，`/\$\{?[0-9]/` 会把 `max-age=${60 * 60 * 24 * 365}` 误判。
- `schema.org` / `w3.org` / `open.er-api.com` / `js.stripe.com` 走 `URL_ALLOW`。
- 双语内容降级：行内含 `pickName(`/`pickLang(`/`pickDescription(`/`lang === "zh"`
  → 中文是数据不是泄漏。**判断必须取前后各 3 行窗口**（调用与参数常分处两行）。
- `components/shop/currency-server.ts` 是 server-only（中文只进日志）→ 例外表。
- `lib/validations/` 只有 `auth.ts`/`cart-order.ts`/`address.ts` 服务前台。

**当前基线：344 文件 / P0 = 0 / P1 ≈ 1656**（P1 大头是后台中文，有意为之）。
`fetch-client.ts` 已补进 `SHOP_FACING_FILES`（它的兜底文案会进英文前台 toast）。

## 必须一起跑的第二个扫描器：`scripts/qa/qa-error-lang.mjs`

**主扫描器 P0 归零 ≠ 真的没有泄漏。** 主扫描器按「目录」判定是否前台，
会系统性漏掉一整类：`unauthorized("中文")` / `badRequest("中文")` 等
**错误构造器散落在 `src/app/api/auth|user/*`、`src/server/services/*.ts`、
`src/lib/<domain>/*.ts`** —— 这些目录名里没有 `(shop)`，按目录判定全漏。
而 `ERROR_ZH` 只做英→中，中文 key 查不到 → **原样透出给英文用户**。

2026-09-19 实测：主扫描器报 P0=0，这个定向扫描器又扫出 **46 处**顾客可见的中文错误文案。
判据：行内出现 `ctor(` + 引号 + 含 CJK 且非注释；按设计跳过 `/api/admin/*`。
**两个扫描器都要归零**。

## 错误文案本地化：两级表（改 `error-i18n.ts` 时别退化成一级）

- `ERROR_ZH`：精确表（英→中）。
- `PATTERN_ZH`：**正则模式表**，用于**带插值**的文案。精确表对
  `Option "Size" is not available for this product`、`Not enough stock — only 3 left`
  这类**永远命中不了**（每次插值都不同）→ 中文界面会一直显示英文。
- 顺序：精确 → 模式 → 原样返回。单测见 `scripts/qa/qa-error-i18n.ts`。

## 刷新令牌轮换：`ROTATION_REUSE_GRACE_MS = 60_000`（**不要删**）

`proxy.ts` 在 access token 失效时对**每个**请求调 `rotateSession`，
同一页面的并发请求带**同一个** refresh token 到达。没有宽限期时：
A 轮换出 R2 → B 善意重试回收 R2 → C 看到「链已闭合」⇒ **判重放、吊销全部会话**。
另一种触发路径：并发响应覆盖 Cookie 顺序，客户端留下的是**已被吊销且无后继**的 R2
⇒ 下一次请求直接命中重放分支。

不变量：善意分支**只在「链未闭合」时**回收后继 token —— 链已闭合说明后继
可能已写进客户端 Cookie，回收它会让下一次请求再踩重放分支。

反证/回归测试：`scripts/qa/qa-rotate-concurrency.ts`
（必须 `NODE_OPTIONS=--conditions=react-server`，因为 `session.ts` 带
`import "server-only"`，默认条件下该包会主动抛错；且本仓库无
`"type": "module"`，tsx 按 CJS 处理 → 不能用顶层 await）。

## FAQ 内容：库优先，`seedFaqs()` 只回写「未被编辑过」的行

`/pages/faqs` **先读库、库空才回落 `FAQ_DEFAULTS`**。改 `faq-defaults.ts` 的文案
**不会影响线上**，除非库里的行被同步。`prisma/seed.ts` 的 `seedFaqs()` 规则：
表空则全量写入；表非空则只回写 `updatedAt === createdAt`（后台从未改过）且文案过期的行。
**运营在后台改过的行一律不动。**

## Next dev 相关（排查 500 必看）

- 同一时间只能有一个 `next dev`；第二个实例会退出并打印已有实例的 PID 与日志路径。
- Next 自身事件在 `.next/dev/logs/next-development.log`；但 **pino 的 `logger` 走 stdout**，
  该文件里没有 → 要抓业务错误必须让 dev server 的 stdout 重定向到文件。
- **stale Prisma client 会伪装成 500**：长期运行的 dev server 若启动早于最近的
  `prisma generate`，新模型在它进程里是 `undefined` → 接口 500 `INTERNAL_ERROR`。
  排查 500 先确认服务进程是否早于 schema 变更，重启即可。

## env 层（商用部署）

- `SITE_NAME` / `MAIL_FROM` 已在 `.env.example` 中列出；生产未配置且
  `REQUIRE_STRONG_SECRETS=true` 时**拒绝启动**。
- `PLACEHOLDER_BRAND`（`lib/env.ts`）是全站唯一品牌字面量，
  **声明必须在生产守卫之前**（否则 TS2448）。
- `MAIL_FROM` 默认空 → 由 `brandFallback` + `SITE_URL` 域名自动拼出，导出为
  `mailFrom`。不要再用 `no-reply@example.com`（IANA 保留域，会被拒收）。
- 后台金额符号一律从 `getCurrencyDef(code).symbol` 取；`env.CURRENCY` 经 props
  透传到客户端组件（如 `admin/shipping` 的 `baseCurrency`）。

## 沙箱 curl 必须加 `--noproxy '*'`

环境里设了 `HTTP_PROXY=http://127.0.0.1:62696`，直接 `curl http://localhost:3000`
会得到 502。测 API 要 `curl --noproxy '*' ...`。
另外 `ps` / `netstat` 在沙箱内不可用；后台起服务要用工具的 background 模式，
`nohup ... &` 会随父 shell 被 SIGTERM 一起杀掉。

## 取证通道修正（2026-09-19，重要）

- **`WebFetch` 打 `https://r.jina.ai/<url>` 可用**；而同一时刻 Node `fetch` 打
  r.jina.ai 会 `UND_ERR_CONNECT_TIMEOUT`、打 shop.x.com 会 `ECONNRESET`。
  → **读原站 DOM 文本一律用 WebFetch + r.jina.ai，不要用 Node fetch。**
- **shell `grep` 会静默返回「无匹配」**（exit 1，不报错）。文本检索必须用
  ripgrep 工具或 Node。曾据此误判「i18n 词典缺 auth 文案」，差点去修不存在的缺口。
- `lsof -ti tcp:3000` 可用；`pkill -f "next-server"` / `pkill -f "next/dist/bin/next"`
  可清掉**挂死的 dev server**（它占着端口但不响应，第二个实例会 `EADDRINUSE`）。
- 本卷上 `/auth/login` 这类带完整 shop layout 的路由**首编译实测 211s**，
  通知类接口 3.4min。写探针要给足超时或放后台。

## 原站事实（2026-09-19 取证）

- `/collections/all` = **22 个商品**，价格区间 **$25–$80**，2 个售罄。
- 页脚 7 条含 `/pages/data-sharing-opt-out`（`Your Privacy Choices`）。
- `/cart` 是主题页；**`/account/login` 也是主题页**（同页双表单 `#login` / `#recover`，
  文案 `Recover password` / `Enter your email to recover your password:` / `Recover` /
  `Remember your password?` / `Back to login`）。
- **`/checkout` 是 Shopify 托管结账**（`/cart/<variantId>:<qty>` 直接跳过去，
  带 CAPTCHA 拦截）→ 本地 `/checkout` **没有 1:1 可比对象**，样式对齐不适用。
- 商品 JSON：`https://shop.x.com/products/<handle>.js` 可读 variant id。

## 版式判据（用于断点决策）

- `tailwind.config.ts` 的 `container.padding` = `DEFAULT: 1.25rem` / `sm: 3rem`
  → **≥640px 起容器左右各 48px**（按 20px 估算会得出错误结论）。
- 全局断点仍是 Tailwind 默认 640/768/1024/1280；原站的 **700/1000** 是用
  `min-[700px]:` / `min-[1000px]:` 与 globals.css 媒体查询**就地实现**的，不是全局覆盖。
- 购物车表格固定列合计 **512px**（数量 289 + 合计 130 + 移除 93）→
  700px 视口只剩 **92px** 给商品列，**768 才是正确下限**。故 cart/account/orders
  的 `md:` 用法**保持现状是正确的**，不是漏改。

## 新增测试守卫（2026-09-19）

- `tests/unit/i18n-keys.test.ts`：源码里每个 `t("…")` 字面量必须在对应词典命中。
  因为 `translate()` 缺词条**不报错**，而是静默回退到英文源串（中文界面漏英文）。
  含防假绿守卫（扫描规模下限）与负向验证。
- `tests/integration/payment-notify.test.ts`：支付回调全链路
  （验签 / 金额 / 币种 / 幂等 / 渠道状态），用真实 RSA 密钥对。
- **金额判据必须换算成整数分**再精确比较：`90.01 - 90 === 0.010000000000005116`
  在 IEEE754 下**大于** 0.01，浮点容差会把「刚好差 1 分」判错。
- **测试里不要落盘临时文件**：沙箱的安全删除守卫会拦 `fs.unlinkSync`
  （单轮删除计数超阈值即抛 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。
- **集成测试要当心业务限流**：建单接口 `5 单/600s`，多建单用例会从第 6 个起全 429。
  用生产导出的 `resetRateLimit(key)` 重置，**不放宽阈值**。

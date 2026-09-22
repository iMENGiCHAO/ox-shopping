# 项目长期记忆 — Ox Shopping（对标 shop.x.com）

## 定位与最高口径

Next.js 16 + Prisma/PostgreSQL 自建全栈电商，目标是**逐项 1:1 复刻**官方 `shop.x.com`
（SpaceXAI Shop，Shopify Impact 主题）的样式、页面交互动态与功能。2026-09-18 起 = **实现阶段**。

**用户口径（优先级最高）**：
> "这个按原网站的来。你拿不定主意的 就看原网站 shop.x.com。"

即 **原站是唯一基准**。曾被我归为"产品决策/商业必需/有意保留"的事项（collections 只有 2 个、
页脚多 `Refund Policy`、B3/B4/B5 未做）已被明确否决。要求：样式/交互与原站一致 +
前后端**均无硬编码** + 可直接商用交付。仅"已成型且实用的效果"（画廊灯箱、`btn-sweep`、
`link-underline`、collections 悬停缩放）可保留 —— 但不能成为偏离原站的借口。

## 🔴 被错误前提删掉的表（2026-09-18 复核）

`prisma/migrations/20260910042551_drop_reviews_coupons/` 曾以「原站没有的冗余功能」为由
DROP 了三张表。该注释的两个论断**一真一假，必须分开看**：

| 被删对象 | 注释判断 | 事实 | 处置 |
| --- | --- | --- | --- |
| `coupons` / `coupon_redemptions` | 原站没有 | **错**（Shopify 原生支持折扣码） | ✅ 已恢复并完整实现 |
| `reviews` | 原站没有 | **对** | ❌ 保持删除，**不要新增** |

评价取证（两条独立通道 × 两个商品，零命中）：`r.jina.ai` 读 `/products/x-icon-t-shirt`
与 `/products/the-grok-hoodie` 的 DOM 文本，检索 review/rating/star/aggregateRating/
Write a review/judge.me/loox/okendo/yotpo/stamped 零命中；thum.io 整页截图肉眼核对也无评价区。
→ **本地「没有评价」才与原站一致，新增评价＝偏离原站。**

**教训**：一条注释里的多个论断要**分别**取证。曾因「优惠券那条被推翻」把「评价」一并反转，属过度推广。
原始表定义仍在 `000000000000_init/migration.sql`，`reviews` 保留作参考**不启用**。

## 原站取证通道（🔴 2026-09-20 晚再修正）

**当前（09-20 晚）真实可用性 —— 与 09-20 早些时候已不同：**

| 通道 | 结果 |
| --- | --- |
| Node `fetch` → `shop.x.com` | ❌ `ECONNRESET` |
| Node `fetch` → `r.jina.ai` | ❌ `ETIMEDOUT` |
| **`WebFetch` → `https://shop.x.com/<path>`** | ✅ **直连可用**（markdown 文本，丢 CSS/几何） |
| `WebFetch` → `r.jina.ai/<url>` | ✅ 可用 |
| **Playwright → `shop.x.com`** | ❌ `ERR_CONNECTION_CLOSED`（**代理层单独拒 x.com**） |
| **thum.io 截图** | ✅ 可用（经代理）—— 目前**唯一**能拿几何/像素的通道 |

**Playwright 出网必须显式挂代理**（Chromium 不读环境变量）：
```js
const b = await chromium.launch({ proxy: { server: process.env.https_proxy } }); // 127.0.0.1:5xxxx
```
挂上后 example.com / cdn.shopify.com 都 200，但 **x.com 与 shop.x.com 仍被拒** ——
所以 Playwright 现在**只能量本地**（`http://localhost:3000`，记得 `bypass` 或不挂代理）。

### thum.io 的两种渲染语义（🔴 别搞混）

- **`width/N`（N ≥ 500）= 「1200 布局等比缩放到 N」**，不是 N 宽的布局。
  证据：`width/600` 页脚高 104 = 208×0.5、单行链接墨迹 416 = 833×0.5；`width/700` = 208×0.5833。
  → 用它找断点、比字号**全错**。
- **`iphoneX/width/375/...` = 真正的 375 移动端布局，1:1**。
  校验办法：看**居中元素**的中心（版权/选择器中心 = 187 = 375/2；若布局是 391 应为 195.5）。
  `iphoneX` 会**忽略** `width/414`，仍返回 375×3639。
- 整页用 `.../fullpage/noanimate/<URL>`；`crop/<h>` 的 h 上限 1200。

### 像素对照的规矩

两侧**同法**才可比：同一解码器（`pngjs`，在 node_modules 里）、同一阈值、同一「找页脚顶」算法。
⚠️ 阈值会把细笔画侵蚀掉（11px 字尤其明显）⇒ **宽度比要用多组长标签互相印证**，
单看一条短标签（如 `FAQs`）会偏。字号判据优先用「同字符串在两侧的墨迹宽度比」，
而不是绝对值。脚本模板见 `/tmp/scan-footer.mjs`（从底部往上找黑底页脚 → 行带 → 横向分段）。

## 品牌名（全站单一来源）

`src/lib/env.ts` 的 `SITE_NAME` → 导出 `brandFallback`。运行期真实品牌 = 库
`site_settings.siteName`。**任何地方都不要写品牌字面量**：
服务端用 `brandFallback` 或 `pickLang(settings.siteName, lang)`
（`@/server/services/settings.service`）；客户端由 layout 注入 —— 前台
`ShopLangProvider.siteName`、后台 `LangProvider.siteName`，各导出 `useSiteName()`。
⚠️ `pickLang` **只在 `settings.service`**，`lib/shop-i18n` 只有 `pickName`。

## 原站真实布局参数（改样式以此为准）

| 项 | 值 |
| --- | --- |
| 断点 | **700px / 1000px**（本地用 640/768，不一致） |
| 全宽容器 | `padding: 0 48px`，内容宽 = 布局宽 − 96（1216 → 1120） |
| 内容页容器 | `max-width: 720px` + `padding: 20px`（FAQ 正文列 268..946 = 679px） |
| header | 65px 纯黑；375–680 = 59px + 居中 Logo + 2 图标；700–950 = 65px 居中 Logo + 3 图标；≥1000 = 65px + Logo 左对齐 x=48 + 文字导航 |
| PDP 栅格 | **7fr / 80px / 3fr**（1216 → 媒体列 728 / 信息栏 312） |
| PDP 缩略图 | 图 52×52（盒内缩 2px）装在 **56×56** 盒内，**盒间距 16px**，盒左缘 x=48 |
| PDP 主图 | 1216 下 **592×592**，顶 y=113（媒体列内 x=184 = 48+56+80） |
| PDP 加购按钮 | 46px 高，方角，`rgb(28,28,28)` |
| PLP `/collections/all` | 3 列 **341×341**，列间距 48px，**行 pitch 470px**，首图顶 y=280，标题 `Products`（字形带 y139..158） |
| PLP 卡片内部 | 图底→标题字形顶 **25**；标题盒 **= 一个行高 20.4px**（**不预留两行**）；标题字形底→价格字形顶 **16**；价格字形底→下行图顶 **70** |
| PLP 卡片字号 | 标题与价格**同为 12px**（字形带高均 9px）；标题 `rgb(28,28,28)`、价格约 `rgb(112,112,112)`；价格宽 ≈34px |
| PLP 控件 | **无**计数 / 无筛选 / 无排序 / 无分页 |
| collections | 3 列 **353×353**，间距 30px，卡顶 y=214，底色 `rgb(239,239,239)`，标题**白字 20px 叠卡内左下**（x=96 / 底距 40） |
| collections 数据 | 4 个，顺序即：`Mens`、`SpaceXAI Collection`、`Womens`、`X Collection`；卡图取 `Category.cardImage` |
| collections 成员 | `/collections/mens` = **15 件**（`prisma/xcom-collections.ts` 的 `MENS_MEMBERS`）；Womens 同 15 件 |
| 集合归属 | **多对多**（一件商品可同属多个集合）→ 归属 = 「主分类命中」∪「`product_collections` 成员行」 |
| 首页横幅 | `[X Collection]` 左 / `[SpaceXAI Collection]` 右 —— **与 /collections 顺序不同**，靠 `Category.homeSortOrder`(1=左,2=右) 选，不能取"前两个分类" |
| 首页横幅文案 | 横幅顶 y=65（=header 高）；名称字形带 **y119..134**（22px）；`Shop All` 按钮盒 **y169..214**、x48..156（108×46）⇒ `sm:top-[49px] sm:gap-[27.5px]` |
| 商品图底色 | `rgb(217,217,217)`（**不是** `#EFEFEF`/`--muted`） |
| 主按钮底色 | `rgb(28,28,28)` |
| 页脚 **7 条** | `FAQs` · `Search` · `Accessibility Statement` · `Privacy Policy`(原站外链 `https://x.com/en/privacy`；**本地按大爷要求改站内 `/policies/privacy`**) · `Terms and Conditions`(→ `/pages/terms-and-conditions`) · `Cookie Consent`(→ `/?preview_privacy_banner=1`) · `Your Privacy Choices`(→ `/pages/data-sharing-opt-out`)；**无** Refund Policy；`X Corp © 2024` |
| 页脚桌面 @1200 | 总高 **208**；行1 字形顶距顶 69、行2（工具行）144；链接行**居中**、墨迹 186..1018（833）、6 个间隙 21/21/22/21/22/22（⇒ CSS **20px**）；链接 15px / 行高 24.75 |
| 页脚移动 @375 | 总高 **283**、底色纯黑；链接行**左对齐**（左缘 25 ⇒ 容器内边距 **24**）、字号 **11.2px = 0.7rem**（桌面 15px 的 0.7467×）、行高 18.48、行 pitch 42.5、**折行 4/2/1**；距顶：行1 44 / 行2 87 / 行3 129 / 选择器 184 / 版权 229；选择器与版权字号**与桌面相同**（只有链接变小） |
| 页脚工具行 | 选择器 + 版权字号 **11px**（**两侧都是**，本地原为 `text-xs` 12px）；行盒仍 16px ⇒ 纵向节奏不变。旗帜是**图片**（20×15，4:3）不是 emoji —— 本地自持 `public/flags/<iso2>.svg`（`lipis/flag-icons` 4x3），`CurrencyDef.flagCode` 给 ISO alpha-2。箭头 16px 盒（墨迹约 9.3×5.3；原站页头 8×5、页脚 10×6） |
| /cart 空态 @375 | 副标题 **11px**、按钮文字 **12px**、按钮 **158×43**（桌面是 15/14/175×46）；字形带顶：标题 205 / 副标题 245 / 按钮 282；**页脚顶 465、页高 748** |
| /cart 空态 @1200 | 字形带顶：标题 332 / 副标题 379 / 按钮 428..472（**172×45**）；**页脚顶 734** |
| 空态内边距 | **上下相等**：`--cart-empty-pb = var(--cart-empty-pt)`（375 → 140/140；1200 → 261.6/261）。原写死 250px ⇒ 移动端页脚顶偏 132px |
| /collections @375 | **1 列**（桌面 3 列）；卡片 **335×335**、行 pitch **359**、首卡顶 **169**；H1 **20px**（桌面 28）；卡内标签 **18px**、内缩 **22/21**（桌面 20px / 48/40）；末卡→页脚 **35**；页高 **1899**、页脚顶 **1616** |
| /search 空态 @375 | H1 **16px**（桌面 18）、墨迹 y165..175；输入框 y214..228；区块上下内边距 **100 / 93**（桌面 200/200）；页高 **624**、页脚顶 **341** |
| /pages/faqs @375 | H1 墨迹 106..123（20px）；正文 **14px / 行高 18px**（桌面 15/25 —— 这是移动端 FAQ 页高的主因）、段间墨迹间隙 24~27；首段墨迹 **203**；`--faq-head-gap` **64**（桌面 91） |
| 政策页 @375 | 正文 **14px / 行高 25px**（与桌面同）—— ⚠️ 与 FAQ 的 18 **不同**，两页共用 `.prose-page`，FAQ 靠额外的 `.faq-prose` 分流。本地政策页顶部多一行 `Last updated`、原站是 `General` 小标题（内容差异）；原站 terms 页高 7740 vs 本地 1414（文案不同，非布局） |
| 首页 @375 | 横幅两张并排满幅出血 **59..223 = 164**（原站 164 ✓）；`All Products` 墨迹 269；网格卡 **172×234 / pitch 272**（与原站一致）。⚠️ 页高差异来自**商品数**：原站 22 件 ≈11 行，本地 30 件 ≈15 行 |
| PDP @375 | 主图 **59..434，375×375 满幅出血**（原站完全一致 ✓）；标题墨迹 501（本地 503 ✓）；描述行 pitch **18**（`.desc-prose` 移动端 14/18）。🔴 **本地整块缺 Size Chart**：`SIZE_CHARTS` 注册表 14 个 slug 不含 `x-icon-t-shirt`、DB 也无值 ⇒ `sizeChart` 为 null。原站有（1037..1178）。页高 1687 vs 1825，差的 138 ≈ 缺的 Size Chart（141） |
| PDP 描述段落 | `prisma/xcom-catalog.ts` 的 `description` **无换行**（296 字一整块），原站 `body_html` 是 3 个 `<p>` ⇒ 生成 catalog 时丢了段落分隔。全量可取：`WebFetch https://shop.x.com/products.json?limit=250`（97,906 字符 / 30 商品）。⚠️ `seed.ts` 用 `update:{}` ⇒ 重跑 seed 不更新已有行，需一次性 DB 写入。⚠️ `/products/<handle>.js` 的 `price` 按地理返回（$35 报成 4700），**只能取描述不能取价** |
| /collections 卡片底色 | **与页面底色同为 `rgb(239,239,239)`** —— 不能用颜色找卡片边界。改用「深色商品照片 bbox」按比例反推卡片尺寸（本地 160 时照片 124×149 ⇒ 原站照片 261×314 ⇒ 卡片 337） |
| FAQ 页 | `<h1>FAQs</h1>`（字形带 y138..155，x 577..640）+ **10 组「加粗问题 + 散文答案」**，无手风琴、无联系卡片；正文列 x=269 w=680，首段字形带 y265..278 |
| 国家/币种 | 35 个国家 |

## 后台表格的「塌列」陷阱（2026-09-21）

`components/ui/table.tsx` 是 `w-full table-fixed` + 外层 `overflow-x-auto`。
**若某一列没写 `w-[..]`，它就是"被挤压的那一列"** —— 容器窄于其余定宽之和时，
它会被压到 **0 宽**，单元格内容竖排成单字并压到相邻列上（`/admin/distribution/rules` 实测：
1024 视口下「作用域 ID」列宽 = 0，`（全局，不限作用域）` 一字一行压住「层级」）。

**规矩**：每列都显式定宽，并把宽度之和写进 `Table` 的 `min-w-[..]` —— 这样容器不够时
走横向滚动而不是压列。窄屏再用 `hidden xl:table-cell` 渐进披露低优先列，
`min-w` 同步分档。

- ⚠️ **`truncate` 对 inline 元素无效**：`<span className="truncate">` 不会截断，必须 `block truncate`。
- ⚠️ 骨架行要同步隐藏（否则加载态「表头没这列、单元格有骨架条」）。
- ⚠️ `tailwind.config.ts` 把 **`2xl` 改成 1600px**（默认是 1536）—— 算分档别按默认值推。
- 分档依据是**后台内容区实测宽度**（654@1024 / 910@1280 / 1070@1440 / 1230@1600），
  不是视口断点。

## 分销系统（2026-09-21 审计）

产出 **`docs/DISTRIBUTION_COMMERCIAL_READINESS.md`**（现有 `COMMERCIAL_DELIVERY_GAP_ANALYSIS.md`
**完全没覆盖分销**）。结论：架构与资金主链路质量很高，可进灰度；**5 个 P0** 需在真实收款前解决。

**已做对的（别动）**：闭包表关系链、`DistributorCustomerBind.customerId @unique`（数据库级防抢绑）、
`CommissionLog @@unique([orderId,toUserId,level])` + `createMany({skipDuplicates})`、
结算用条件更新认领 + `$transaction`、受益人快照 + `toUserId` 可空（注销后账本仍在）、
部分退款按比例增量冲正、GLOBAL 规则用**空串**而非 NULL（PG 唯一索引里 NULL 互不相等）、
`bridge.ts` 三铁律（异常全吞 + 开关即隔离 + 懒加载）、5 分钟对账兜底。

**P0**：① 提现「扣款」与「建单」不在同一事务（**已修**，包进 `$transaction`）
② 无拒付/争议处理（全仓 `dispute|chargeback` 零命中）③ 无个税代扣字段
④ `maxCommissionLevels` 默认 3 ✓ 但可配到 10（国内三级分销红线）⑤ 提现无日/月额度与冷却期。

**登录后台**：`admin@example.com` / `Admin@123456`（`prisma/seed.ts`）。
登录有 **CSRF**（直接 fetch 会 403）⇒ 必须真浏览器；**填完要等水合再点提交**，
否则静默不提交（URL 停在 `/auth/login`）。

## 本地实现里"注释前提是错的"（改之前先看）- `globals.css` `.pdp-shell`：注释称"官方桌面端左边距略小"→ 写 `padding-left:10px`，
  **实测左右均 48px**，导致 PDP 整体左移 38px。
- `components/shop/product-card.tsx`：注释称"13px 标题/15px 价格"，**实测同为 12px**；
  曾写 `min-h-[41px]` 预留两行标题，**原站标题盒恰好一个行高**，多出的 21px 把行 pitch 顶到
  492.8（应 470）。已修。
- `components/shop/footer.tsx`：注释称 "exact link list"，**与事实不符**（多 Refund Policy、缺 Your Privacy Choices）。
- `docs/DESIGN.md §2`：写"信息栏固定 336px""桌面 padding 0 48px"，**均与原站实测不符**。
- `docs/PRODUCTION_CHECKLIST.md`：为**不存在**的优惠券系统写 `usageLimit` 检查项。

## 取证陷阱（踩过，别再踩）

- **本地自测绝不要用 `127.0.0.1`**：Next 16 当它跨域 dev 来源，静默拦截
  `/_next/static/chunks/*` 与 `/_next/hmr` → **chunk 全挂、React 永不水合**。极具迷惑性：
  HTTP 200、SSR 正常，但依赖水合的元素（如 `/cart` 的 h1）永不出现。已加 `allowedDevOrigins`。
- **sticky 元素必须等回位再量**（PDP 缩略图栏/信息栏）：滚到底再回顶不会立刻回位 → 量到
  **整体下移 ~126px 的假数据**。需 `scrollBehavior=auto` + 滚两次 + 间隔 2.5s/1.2s。
- **`img[alt]` 在 PDP 上先命中缩略图** → 主图量成 52×52。应取"容器内面积最大的 img"。
- **截图扫带 ≠ DOM 几何**：截图可能带滚动偏移；纵向坐标以
  `getBoundingClientRect().y + scrollY` 为准，扫带只用于**两侧同法对比**。
- `domcontentloaded` + 短等待的整页截图会**漏懒加载图**；判定"缺图"前必须查 `naturalWidth`。
- 暗像素测量会把**浅色小字**连通域削窄 → 误判字号；字号要用**字形高度**交叉验证。
- 两个不同 URL 返回相同字节数 = 占位图，不要当成"页面重定向"。
- **`k vw` = 视口宽的 k%**，对应 px/px 斜率是 **k÷100**。写过一次 `0.1474` 直接当 `0.1474vw`
  → 小了 100 倍。**写完必须在两端（如 375 与 1216）各验证一次**。
- **同一文件的多处 `Edit` 必须拆成多条消息**：一条消息里发多个 Edit 会**互相覆盖**
  —— 报 success 但没落盘（曾一轮踩 4 次）。改完务必 `grep`/`sed` 回读。
- **响应式核对不能只测一个视口**：desktop 全绿、mobile 一测就出偏差。
- **判「原站有没有 X」绝不能只靠一种查询**。踩过：用「导出 `<footer>` 内全部 `<a>`」
  断定原站页脚只有 6 条，实际第 7 条 `Your Privacy Choices` **不在 `<footer>` 元素内** →
  漏判并误删了它。要**多通道交叉**（DOM 文本 + 两个宽度的像素扫描），
  并且要问「我的查询范围是不是把目标排除了」。
- **改完代码后第一发请求可能拿到旧 HTML**：Turbopack 边服务边重编译，
  首个请求会返回改动前的标记（表现：新类名不在、旧类名还在）。量之前先 `fetch` 预热一次，
  或先确认 HTML 里有新类名再下结论。
- **像素对照必须两侧同法**：同一解码器（`pngjs`）+ 同一阈值 + 同一「找页脚顶」算法。
  阈值会侵蚀细笔画（小字号尤甚）⇒ 字号判据用「同字符串两侧的墨迹**宽度比**」，别用绝对值。
- **量「页脚顶 / 页高」必须确认两边都不在被撑高状态**：本地 `(shop)/layout.tsx` 是
  `min-h-screen` + `main{flex-1}`（**有意的**，让短页面底色铺到页脚），于是视口一高，
  页脚就被推到视口底。本地在 812 高视口下页脚顶 530，用 **375×600**（内容 748 > 视口）量
  才得到与原站一致的 465。**不去确认这一点，就会去改一个本来就对的令牌。**
- **求包围盒时测量窗口不能切到目标**：把窗口设成 `x:130..250` 时文字 bbox 左缘恰为 130
  （=窗口边界），据此算出「间距只有 2px」差点改错。bbox 贴窗口边界 ⇒ 无效，把窗口往外扩再量。
  **贴边界的第二种成因是阈值**：`/collections` 卡片底色是 `rgb(239,239,239)`，
  阈值取 200 时整片底色都被当成"墨"，bbox 自然等于窗口。白字要取到 **248** 才只命中字。
  ⇒ bbox 贴窗口时，**先怀疑阈值，再怀疑窗口**。

## 工程/环境陷阱

- **新增 HTTP 方法（PATCH 等）后必须重启 dev server**：路由方法集在编译期注册，热更新不生效，
  一直 405，容易误判"代码没生效"。
- **改 Prisma schema 后必须重启 dev server**：旧进程持有旧客户端 → 新模型 `undefined`
  → 页面报 `Cannot read properties of undefined (reading 'findMany')`。500 排查先确认进程
  是否早于 schema 变更（**stale Prisma client 会伪装成 500**）。
- **`prisma generate` / `migrate deploy` / `db:seed` 需 `dangerouslyDisableSandbox: true`**
  （要覆写 `node_modules/.prisma/client`，被 safe-delete 拦 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。
- 沙箱**拦截 `rm`/`npx`/`tsc`**（"Brokered program policy check unavailable"）→ 用 `git rm`、
  `./node_modules/.bin/<bin>`，必要时关沙箱。`ps`/`netstat` 不可用。
- 沙箱设了 `HTTP_PROXY=http://127.0.0.1:62696` → `curl` 测本地必须加 `--noproxy '*'`，否则 502。
- **shell `grep` 会静默返回「无匹配」**（exit 1，不报错）→ 文本检索用 Grep 工具或 Node。
  曾据此误判"i18n 词典缺 auth 文案"。zsh 下 BSD `grep` 也不支持 `\|`。
- zsh 不对未加引号的变量分词；zsh 会把未加引号的 `[id]` 当通配符 → 路径要加引号。
- 从 `/tmp` 下脚本 import 项目依赖需 `createRequire("<repo>/package.json")`。
- `/Volumes/Time Machine` 是网络卷：`.next` 编译慢（首请求可达 100s+，`/auth/login` 实测 211s），
  探针给足超时或放后台；**用工具的 background 模式直接跑 dev server**（命令本身就是 dev server，
  不要加 `&`/`nohup`）。⚠️ 起服务本身要 12–25s，探测太早会得到 `ECONNREFUSED` 而误判"没起来"；
  新实例若发现 3000 被占会**自己退出**并打印既有实例的 PID ——
  看到 "Another next dev server is already running" 说明老的那个还活着，别重复起。
- `lsof -ti tcp:3000` 可用；`pkill -f "next-server"` 可清挂死的 dev server。
- `.next/dev`（Turbopack 缓存）损坏会让 dev server **完全挂死**（端口可连但无响应，日志停在
  "Finished filesystem cache database compaction"）→ `rm -rf .next/dev` 重启。
  另一种形态是**进程直接崩**：日志出现
  `turbo-tasks: an internal panic occurred outside the per-task panic boundary` +
  `Restore of All for task TaskId … failed` + `Aborting.`，端口变 `ECONNREFUSED`
  （`lsof` 里还留着残留 PID）。处置相同：`kill -9 <pid>` → `rm -rf .next/dev` → 重启。
  实测 `.next/dev` 会涨到 **1.6GB**，删除 + 首编译约 1–2 分钟。
  ⚠️ **删完立刻跑 `qa:layout` 会假红**：PDP 那 10 项全报 `0×0` / `(未找到)`
  （脚本自带预热，但冷编译下 `domcontentloaded` 早于布局完成）。
  预热要**打对路由**：`qa:layout` 的 slug 是**动态取的**
  （`/api/products?pageSize=50` → 第一个有货的，当前是 **`xai-vessel`**），
  预热 `/products/x-icon-t-shirt` 没用。先跑一次下面这段，再跑 qa:layout 即 50/0：
  ```bash
  node -e 'const r=await fetch("http://localhost:3000/api/products?pageSize=50");const j=await r.json();
  const s=j.data.find(p=>(p.stock??0)>0)?.slug;await fetch("http://localhost:3000/products/"+s);console.log(s)'
  ```
  **看到一批同源项同时归零，先怀疑冷编译而不是代码。**
- 截图前预置 `localStorage["cookie-consent"]="all"`，否则固定定位的同意条遮挡页脚。
- **本机集成测试极慢**（测试库 `.test-postgres/` 在网络卷）：「商品列表分页」58s；
  `shop-flow.test.ts` 全链路 60s 超时，放大后又变 `[vitest-worker]: Timeout calling "fetch"`。
  **属环境问题非功能缺陷**，验证功能改用真实 HTTP 全链路。
- **Tailwind 不会为 `var()` 形式的任意值生成字号/行高工具类**：
  `text-[length:var(--x)]`、`leading-[var(--x)]` **静默不生成**（不报错、不告警），
  元素回落到继承的 16px/24px。踩过：1216 下量到 `fs=16px` 才发现页脚链接全错。
  → 要令牌驱动的字号/行高，**写普通 CSS 类**（如 `.footer-link`），别走 Tailwind 任意值。
- **`rem` 换算有精度坑**：`1.546875rem` 在浏览器里算出 **24.7501px**（不是 24.75），
  把桌面页脚整体顶高 1px。**关键尺寸（行高/字高）直接用 px**，别用 rem 的二进制近似。

## 版式判据

- `tailwind.config.ts` 的 `container.padding` = `DEFAULT: 1.25rem` / `sm: 3rem`
  → **≥640px 起容器左右各 48px**（按 20px 估会得出错误结论）。
- 全局断点仍是 Tailwind 默认 640/768/1024/1280；原站的 **700/1000** 是用 `min-[700px]:`
  / `min-[1000px]:` 与 globals.css 媒体查询**就地实现**，不是全局覆盖。
- 购物车表格固定列合计 **512px**（数量 289 + 合计 130 + 移除 93）→ 700px 只剩 92px 给商品列，
  **768 才是正确下限**。故 cart/account/orders 的 `md:` 用法**保持现状是正确的**。
- **后台内容区宽 = 视口 − 370**（1080→710 / 1280→910 / 1440→1070），定表格 min-width 以此为准。
- `src/components/ui/table.tsx` 是 `table-fixed`：列宽取自首行，总宽 > 容器时**按比例压缩**，
  `<th>` 上的 `min-w-*` **不生效**。要控列宽请把 `min-w-[Npx]` 给 `<Table>` 自身。

## 原站事实（2026-09-19 取证）

- `/collections/all` = **22 个商品**，价格 **$25–$80**，2 个售罄。
- `/cart` 是主题页；**`/account/login` 也是主题页**（同页双表单 `#login`/`#recover`，
  文案 `Recover password` / `Enter your email to recover your password:` / `Recover` /
  `Remember your password?` / `Back to login`）。
- **`/checkout` 是 Shopify 托管结账**（`/cart/<variantId>:<qty>` 直接跳，带 CAPTCHA）
  → 本地 `/checkout` **没有 1:1 可比对象**，样式对齐不适用。
- 商品 JSON：`https://shop.x.com/products/<handle>.js` 可读 variant id。

---

## 硬编码 / i18n 三条硬约定（改代码前先看）

1. **服务端错误文案一律写英文**。`throw` / `ApiError` / **zod 校验消息**全写英文；中文由
   `src/lib/error-i18n.ts` 的 `ERROR_ZH` 在 `apiHandler` 统一出口按请求语言替换。
   **在 throw 处写中文 = 原样返回给英文站用户**。新增文案：先写英文，再补 `ERROR_ZH` 一条。
   `lib/errors.ts` 的六个默认文案（`Please sign in first` 等）每个 401/403/404/429/500 都走到，
   必须保持英文。`apiHandler` 同时本地化 `message` 与 `details[].message`；`proxy.ts` 不在该链路，
   需自行调 `localizeErrorMessage`。
2. **前台拼接标点走 `punct(lang)`**：`src/lib/shop-i18n.ts` 导出 → `{ colon, list, parens(s) }`。
   中文全角 / 英文半角。**不要在 JSX 里写 `：`、`（）`、`、`**。
3. **请求语言推断只有一处**：`src/lib/request-lang.ts` 的 `langFromCookies(get)`。
   规则：币种优先（`currency=CNY` → zh），其次 `shop-lang`，默认 en。`lib/api.ts` 与 `proxy.ts`
   都引它，不要再各写一份。

### 错误文案本地化：两级表（别退化成一级）

`ERROR_ZH` 精确表（英→中）+ `PATTERN_ZH` **正则模式表**（用于**带插值**文案）。
精确表对 `Option "Size" is not available for this product`、`Not enough stock — only 3 left`
这类**永远命中不了** → 中文界面会一直显示英文。顺序：精确 → 模式 → 原样返回。
单测 `scripts/qa/qa-error-i18n.ts`。

## 两个硬编码扫描器（**都要归零**）

1. `scripts/qa/qa-hardcode.mjs` —— P0（泄漏到英文前台/商用阻断）存在时**退出码 1**，可挂 CI；
   P1 为提示级（后台中文、服务端日志中文、像素魔数）。**当前基线：344 文件 / P0=0 / P1≈1656**。
   误报治理（别回退）：`$` 金额正则用 `/\$\d/`（`/\$\{?[0-9]/` 会误判 `max-age=${...}`）；
   `schema.org`/`w3.org`/`open.er-api.com`/`js.stripe.com` 走 `URL_ALLOW`；
   双语降级 = 行内 `pickName(`/`pickLang(`/`pickDescription(`/`lang === "zh"`，**判断取前后各 3 行窗口**；
   `components/shop/currency-server.ts` 是 server-only 例外；`lib/validations/` 只有
   `auth.ts`/`cart-order.ts`/`address.ts` 服务前台。`fetch-client.ts` 已补进 `SHOP_FACING_FILES`。
2. `scripts/qa/qa-error-lang.mjs` —— **主扫描器 P0 归零 ≠ 真没泄漏**。主扫描器按「目录」判定前台，
   系统性漏掉 `unauthorized("中文")` 这类**错误构造器散落在 `src/app/api/auth|user/*`、
   `src/server/services/*.ts`、`src/lib/<domain>/*.ts`**（目录名无 `(shop)`）。而 `ERROR_ZH` 只做
   英→中，中文 key 查不到 → **原样透出给英文用户**。2026-09-19 实测：主扫描器 P0=0，它又扫出 **46 处**。
   判据：行内 `ctor(` + 引号 + 含 CJK 且非注释；按设计跳过 `/api/admin/*`。

## 刷新令牌轮换：`ROTATION_REUSE_GRACE_MS = 60_000`（**不要删**）

`proxy.ts` 在 access token 失效时对**每个**请求调 `rotateSession`，同一页面并发请求带**同一个**
refresh token 到达。无宽限期时：A 轮换出 R2 → B 善意重试回收 R2 → C 看到「链已闭合」⇒
**判重放、吊销全部会话**。另一路径：并发响应覆盖 Cookie 顺序，客户端留下**已被吊销且无后继**的 R2
⇒ 下次请求直接命中重放分支。不变量：善意分支**只在「链未闭合」时**回收后继 token。
回归测试 `scripts/qa/qa-rotate-concurrency.ts`（必须 `NODE_OPTIONS=--conditions=react-server`，
因 `session.ts` 带 `import "server-only"`；本仓库无 `"type":"module"` → 不能用顶层 await）。

## FAQ 内容：库优先，`seedFaqs()` 只回写「未被编辑过」的行

`/pages/faqs` **先读库、库空才回落 `FAQ_DEFAULTS`**。改 `faq-defaults.ts` **不影响线上**，
除非库里的行被同步。`prisma/seed.ts` 的 `seedFaqs()`：表空则全量写入；表非空则只回写
`updatedAt === createdAt` 且文案过期的行。**运营在后台改过的一律不动。**

## env 层（商用部署）

- `SITE_NAME`/`MAIL_FROM` 已在 `.env.example`；生产未配且 `REQUIRE_STRONG_SECRETS=true` 时**拒绝启动**。
- `PLACEHOLDER_BRAND`（`lib/env.ts`）是全站唯一品牌字面量，**声明必须在生产守卫之前**（否则 TS2448）。
- `MAIL_FROM` 默认空 → 由 `brandFallback` + `SITE_URL` 域名拼出，导出 `mailFrom`。
  **不要再用 `no-reply@example.com`**（IANA 保留域，会被拒收）。
- 后台金额符号一律从 `getCurrencyDef(code).symbol` 取；`env.CURRENCY` 经 props 透传给客户端组件。

## 测试守卫

- `tests/unit/i18n-keys.test.ts`：源码里每个 `t("…")` 字面量必须在对应词典命中。因为
  `translate()` 缺词条**不报错**，而是静默回退英文源串（中文界面漏英文）。含防假绿守卫。
- `tests/integration/payment-notify.test.ts`：支付回调全链路（验签/金额/币种/幂等/渠道状态），
  用真实 RSA 密钥对。
- **金额判据必须换算成整数分**再比较：`90.01 - 90 === 0.010000000000005116` 在 IEEE754 下
  **大于** 0.01，浮点容差会把「刚好差 1 分」判错。
- **测试里不要落盘临时文件**：安全删除守卫会拦 `fs.unlinkSync`。
- **集成测试当心业务限流**：建单接口 `5 单/600s`，多建单用例从第 6 个起全 429 →
  用生产导出的 `resetRateLimit(key)` 重置，**不放宽阈值**。

## 测量脚本（一次性，放 `/tmp/cmp/`，重启会丢）

常用：`verify.mjs`（1216 逐页截图 + 几何导出 → `/tmp/shots-1216/report.json`，用法
`node verify.mjs "/products=plp" "/collections=collections"`；内置 `waitUntil:"commit"` +
等真实内容选择器、回顶两次等 sticky 回位、主图取最大 img、失败不中断）、`summarize.mjs`、
`warm.mjs`（纯 fetch 预热路由避免冷编译超时）、`ref-plp.mjs`/`ref-fetch.mjs`（thum.io 抓参考站，
整页用 `.../fullpage/noanimate/<URL>`，`crop/<h>` 的 h 上限 1200）、`banner-bands.mjs`
（扫**亮像素**行带，阈值 ≥720 以免把照片亮部当文字）、`text-bands.mjs`、`ink-color.mjs`、
`card-probe.mjs`/`pdp-final.mjs`/`h1-probe.mjs`/`thumb-probe.mjs`、`probe-pw.mjs`。
**若这套取证流程反复用，建议固化为 `scripts/qa/` 下的项目脚本而不是留在 `/tmp`。**

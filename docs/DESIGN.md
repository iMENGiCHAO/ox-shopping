# 设计与交互规范（shop.x.com 对齐 · 已落地）

本文档描述商城前端的视觉设计系统与动态交互效果，与当前代码保持一致。
设计基准为 shop.x.com（SpaceXAI Shop，Shopify Impact 主题）的真实样式：
白底、黑头黑脚、常规字重 Helvetica、0 圆角、极简商品陈列。

> 实施状态：✅ 已全站落地（2026-02 设计整改）。验证脚本见
> `scripts/design-assertions.cjs`（DOM 令牌断言，15 项全通过）。

## 1. 设计令牌

| 令牌           | 值                                                                                                                                                            | 落地位置                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 页面背景       | `#FFFFFF` (`--background`)                                                                                                                                    | `src/app/globals.css`                   |
| 正文/主色      | 均为 `#1C1C1C` (`--foreground` / `--primary`)                                                                                                                 | `globals.css`                           |
| 商品图底       | `#D9D9D9` = `rgb(217,217,217)` (`--ground` / `bg-ground`) —— **不是** `--muted`                                                                                | `globals.css` + `tailwind.config.ts`    |
| 集合页底色     | `#EFEFEF` = `rgb(239,239,239)` (`--surface`)                                                                                                                  | `globals.css` + `tailwind.config.ts`    |
| 描边/输入框    | `#DDDDDD` (`--border` / `--input`)                                                                                                                            | `globals.css`                           |
| 头部/页脚/横幅 | `#000000` (`--ink` + `bg-ink`)                                                                                                                                | `globals.css` + `tailwind.config.ts`    |
| 头部文字       | 白色，链接 `opacity-65` hover 100%                                                                                                                            | 组件内透明度工具类                      |
| 主按钮         | 黑底白字直角                                                                                                                                                  | `ui/button.tsx` default variant         |
| 描边按钮       | `.btn-sweep`：hover 黑色从左扫入（0.45s cubic-bezier）                                                                                                        | `globals.css` components 层             |
| 圆角           | **全部 0**：`--radius: 0rem`，且 tailwind `borderRadius` 刻度整体映射到该变量 —— 历史 `rounded-md/lg/xl/2xl` 自动归零；`rounded-full` 仅保留给色卡/圆形快加钮 | `tailwind.config.ts`                    |
| 字体           | 系统 Helvetica/Arial 栈（中文回退 PingFang/雅黑），字重 400，**无 webfont**（零渲染阻塞、零构建期网络依赖）                                                   | `tailwind.config.ts` + `app/layout.tsx` |
| 阴影           | hairline-first：仅弹层用 `shadow-soft(-lg)`，卡片阴影为 none                                                                                                  | `tailwind.config.ts`                    |

## 2. 布局（2026-02 二次整改：对 shop.x.com 逐像素复刻）

- **头部**：纯黑 65px 吸顶条（下滑隐藏/上滑出现）。**站名居左、无分类导航**
  （与 x.com 一致）；右侧依次 `币种(USD $ ▾) / 登录 / 搜索 / 购物车 (n)`，
  文字白色 65% 透明度 hover 提亮。
- **首页**：两块**对半无缝** Collection 横幅（`aspect-[720/404]`，1216 视口下各 608×341）：
  文案块整体在**左上角**纵向排列 —— `[ 分类名 ]` 22px/400 白色（方括号是字面量），
  其下为 46px **白色描边按钮** `Shop All`（透明底、14px、`px-7`；hover 反白为白底黑字）。
  实测基准（原站 1200 视口截图 `B-vp1200.png`，y 轴 1:1 未裁切）：横幅顶 y=65（= header 高）；
  名称字形带 y 119..134；按钮盒 y 169..214、x 48..156（宽 108）。
  ⇒ 文案容器距横幅顶 **49px**、名称与按钮间距 **27.5px**（`sm:top-[49px] sm:gap-[27.5px]`）。
  图片上覆黑色渐变（`from-black/55 via-black/25 to-black/10`）压暗以保证白色文案可读；
  hover 慢速放大至 1.06（5s）。下方居中 `All Products` 28px/400 → 三列网格。
- **商品列表页**：白底居中标题 `Products`（28px/400）。**无件数文字、无筛选栏、
  无排序下拉、无分页** —— 与原站 `/collections/all` 一致（原站即纯平铺）。
  3 列正方形网格（≥700px；<700px 为 2 列），列间距 48px，
  行 pitch 470px（`--plp-row-gap: 66px`）。
  左侧扁平筛选栏 + 排序下拉仅用于 **`/search`**（`search-sidebar-filters.tsx`），
  不进列表页。
- **商品详情页**：左图右信息，栅格 `.pdp-grid` = **`7fr / 80px / 3fr`**
  （`--pdp-col-gap: 80px`）。1216 视口 → 媒体列 728 / 信息栏 **312**（非 336）；
  信息栏 `lg:sticky top-24`。标题 22px/400、价格 15px（现价 `foreground/60`，
  划线原价 14px）紧随其下，价格与介绍之间 1px `#DDD` 分割线；
  规格选择：颜色组 = 56px **圆形色片**（选中黑环），其他多值组 = 方角通栏下拉；
  加购/立即购买按钮高 46px 黑底白字直角通栏。
- **页脚**：黑色 2 行。链接行**7 条**，标签与顺序逐字对齐原站：
  `FAQs · Search · Accessibility Statement · Privacy Policy ·
   Terms and Conditions · Cookie Consent · Your Privacy Choices`；
  第二行 `币种选择器 · 版权`。
  单一事实来源：`src/lib/footer-nav.ts`。
  > `Refund Policy` 原站页脚没有，2026-09-18 已按「一律以原站为准」移除；
  > `/policies/refund` 页面保留并经站内搜索可达。

### 与 x.com 的已知内容差异（非样式）

- 商品种类/摄影素材为本店自有内容（x.com 是人物品牌大片）；
- 头部货币显示 USD $（默认展示币种 `DEFAULT_CURRENCY="USD"`），切换逻辑与 x.com 的 USD $ 选择器一致。

### 与原站的有意差异（保留的增强 / 商业必需）

以下各项**不是**对齐缺陷，是刻意保留或刻意不做的；改版时不要当成 bug 抹掉：

| 项 | 本项目 | 原站 | 理由 |
| --- | --- | --- | --- |
| PDP 主图 lightbox | 有（点击全屏 + 2 级放大 + 拖拽平移） | 有缩放，交互较简 | 保留更完整的手感，不牺牲样式一致性 |
| `/search` 左侧筛选栏 + 排序 | 有 | 搜索页亦有筛选 | 列表页 `/products` **未**引入筛选/排序，与原站平铺一致；筛选能力只落在搜索页 |
| 商品徽标（售罄/预售/Sale/New/Hot） | 有，左上角 11px 大写 | 有 `Sale` / `Sold out` 语义 | 保留运营所需的标签位，样式沿用原站徽标（浅灰底 / 黑底白字） |
| 低库存提示、预售说明 | 有 | 无 | 转化与售后必需，样式克制（13px 灰字 / 1px 描边块） |
| `/policies/refund` 页面 | 保留并经站内搜索可达 | 页脚无此条 | 页脚已按原站移除该链接；页面本身是售后退款必需，不删 |

> 反面清单（原站有、本项目**有意不做**）：商品卡 hover 快速加购圆钮 —— 原站商品卡
> hover 只换图，无 quick-add；历史注释里的 "quick-add circle" 与实现不符，相关代码与文档均已删除。

## 3. 动态效果（含 2026-02 新增交互）

| 元素            | 效果                                                                                          | 实现                                     |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 预测式搜索      | 输入 ≥2 字符即 250ms 防抖查询 `/api/products`，弹层内渲染缩略图+名称+价格建议，可直达 PDP     | `search-overlay.tsx`（客户端）+ 商品 API |
| 滚动显现        | 区块进入视口时 fade-up（700ms，交错延迟 90ms/卡）                                             | `reveal.tsx` IntersectionObserver        |
| 描边按钮        | hover 背景从左向右扫入（0.45s `cubic-bezier(.785,.135,.15,.86)`）                             | `.btn-sweep`                             |
| 文字链接        | 下划线从左划出                                                                                | `.link-underline`                        |
| 商品卡图片      | hover 双图 opacity 切换（0.2s）                                                               | 双 `next/image` + `group-hover:`         |
| Collection 横幅 | hover 图片慢速放大至 1.06（5s ease-out）                                                      | `duration-[5000ms] scale`                |
| 详情主图        | 放大镜光标 + 点击全屏 lightbox（可再次点击放大 2 级、拖拽平移）；左缩略图切换                  | `gallery.tsx`                            |
| 规格选择        | 颜色组 = 56px 圆形色块（选中黑环）；其他组 = 方角全宽下拉                                     | `buy-panel.tsx`                          |
| 购物车抽屉      | 加购后右侧滑入（300ms），数量/移除/去结算实时更新                                             | `cart-drawer.tsx` + `cart:open`          |
| 吸顶头部        | 下滑隐藏、上滑出现                                                                            | `HeaderShell` transform                  |
| SEO             | `/sitemap.xml`（商品+分类+静态页）、`/robots.txt`、PDP 注入 Product JSON-LD（名称/描述/图/分类/价格/库存） | `app/sitemap.ts` `app/robots.ts` 详情页  |
| 降级            | 全站动效支持 `prefers-reduced-motion`                                                         | `globals.css` 全局 media query           |

## 3.5 鲁棒性约定（商用）

- 伪造/失效分类 slug → 静默回退"全部商品"，绝不 500（`products/page.tsx` 预校验）
- 规格组默认语义：**多值 = 可选规格**（颜色圆片/下拉），**单值 = 展示信息**；显式 `selectable` 声明优先（`types.ts#parseAttributes`）

## 4. 多币种显示

- 支持币种：CNY / USD / EUR / GBP / JPY / HKD / SGD / AUD / CAD。
- 汇率来源：[open.er-api.com](https://open.er-api.com)（`/api/currency/rates`
  服务端代理，6 小时缓存），离线回退内置参考汇率 `FALLBACK_RATES`。
- 选择写入 `currency` cookie（1 年）；**订单金额以 USD（基础币种）结算**——展示币种仅影响显示，
  商品基准价与订单落库均为 USD（`formatOrderAmount` 按订单创建时币种原样渲染，不做二次换算）。
- 模块：`currency.ts` / `currency-server.ts` / `currency-provider.tsx` /
  `currency-select.tsx` / `api/currency/rates/route.ts`。

## 5. 设计 QA 工具链

```bash
node scripts/design-assertions.cjs    # DOM 级令牌断言（15 项：黑白/直角/字重/65px 头栏/46px 按钮…）
node scripts/qa/qa-a11y.mjs           # 无障碍扫描（img alt / 可访问名 / 表单标签 / h1）
node scripts/qa/qa-mobile.mjs         # 375/768 响应式 + 横向溢出检测
node scripts/qa/qa-links.mjs          # 站内断链爬取
node scripts/qa/qa-lang.mjs           # 币种 → 语言/价格联动
```

> 视觉模型走查脚本（旧文档提及的 `design-vision-qa.cjs`）未随仓库提供，已移除该引用；
> 需要时可用 `scripts/qa/qa-shot.mjs` 出图后人工/模型审阅。

## 6. 测试与部署

- 单元/集成测试：`npm run test` / `npm run test:integration`（Vitest）。
- E2E：`npm run test:e2e`（Playwright）。
- 构建：`npm run build`；Docker 部署见 `Dockerfile`、`docker-compose.yml`、
  `deploy/nginx.conf`。

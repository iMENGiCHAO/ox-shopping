# 逐项对比审计：Ox Shopping vs shop.x.com（样式 / 交互 / 功能）

> 审计日期：2026-09-18 ｜ 目标：**逐页逐项找出与原站不一致之处**
> 方法：原站真实渲染截图（thum.io 抓取）+ 本地真实渲染截图（Chromium 1280/1440）+ 源码走查
> 本次未修改任何业务代码。

---

## 〇、审计结论

**整体还原度很高，但"一模一样"尚未达到。** 共定位 **9 处样式偏差、5 处功能缺口、4 处交互/行为差异**，
另有 **3 处仓库文档记载与实现不符**（其中 1 处会把正确实现改错）。

按严重度：

| 级别 | 数量 | 说明 |
| --- | --- | --- |
| A 明显可见偏差 | 6 | 肉眼可辨，需改代码 |
| B 功能缺口 | 5 | 原站有、本地无 |
| C 记录失真 | 3 | 文档/注释/台账写错，误导后续改动 |

**四轮取证累计**（每轮都在上一轮基础上修正基准，D5 已撤销）：

| 轮次 | 范围 | 新增条目 |
| --- | --- | --- |
| 第一轮 | 首页 / PDP / PLP / 搜索 / 登录 | A1–A9、B1–B5、C1–C4 |
| 第二轮 | 桌面 1:1 复测 | D1–D11（其中 **D5 已撤销**，D3 已修订） |
| 第三轮 | 搜索 / 登录 / 政策 / 404 / 页脚 | E1–E16 |
| 移动端 | 375–1200 响应式 | M1–M15 |
| **第四轮** | **基准修正 + PDP 栅格 / PLP / collections / cart / FAQ / 页脚** | **F1–F20** |

### 采集方式说明（重要）

沙箱代理把 `shop.x.com` 列入黑名单（DNS 可解析、连接被拒），`curl`/无头浏览器均不可达。
最终通过 `image.thum.io` 截图服务拿到原站真实渲染图，覆盖：
首页、`/collections`、`/collections/all`、`/products/the-xai-hoodie`、`/cart`、`/account/login`、
`/search?q=hoodie`、`/pages/faqs`、`/policies/*`、404。
本地侧用 Chromium 实拍同构页面。**因此"样式"结论基于像素级目视比对，非计算样式 diff**。

**2026-09-18 补记（两条会改变结论的方法论修正，详见 §二之四）**：

1. thum.io 交付的图像是「布局宽 = 请求宽 + 16px，再裁到请求宽」，**右侧 16px 被裁掉**
   → 横向位置比较必须以**本地 1216 视口**对原站 1200 图，否则混入 16px 误差。
   据此**撤销 D5**（原站右留白实为 48px，与本地一致）。
2. `https://r.jina.ai/https://shop.x.com/<path>` **可读到原站真实 DOM 文本**
   → 内容级比对不再依赖像素猜测；本轮的 FAQ / collections / PLP 结论均以此为准。

---

## 一、已确认一致的部分（不必改动）

这些是逐项核对后确认与原站一致的，列出来避免重复返工：

| # | 项 | 原站 | 本地 |
| --- | --- | --- | --- |
| 1 | 页头结构 | 黑底、LOGO 居左、无分类导航 | 同 |
| 2 | 页头右侧顺序 | `USD $ ▾` → `Login` → `Search` → `Cart (0)` | 同 |
| 3 | 页头高度 | 约 65px 纯黑吸顶 | `header-bar` 65px |
| 4 | 首页横幅 | 两块半宽 16:9 无缝拼接、`[ 分类名 ]` + 描边 `Shop All`、深色渐变压暗 | 同 |
| 5 | 首页标题 | 居中 `All Products`，常规字重 | 同 |
| 6 | 商品网格 | 3 列、浅灰图底、居中商品名 + 居中浅灰价格、**无划线价** | 同 |
| 7 | 分类落地页 | 全宽 hero（约 3.49:1，**横幅内无任何文字**）+ 3 列网格 | 同（代码注释已标注） |
| 8 | 列表页控件 | **无筛选 / 无排序 / 无分页** | 同 |
| 9 | PDP 布局 | 左缩略图轨 + 中主图 + 右信息栏（约 375px）、标题→价格→分隔线→描述 | 同 |
| 10 | PDP 控件 | 规格下拉（方角全宽 46px）、数量步进器 `− n +`、46px 黑底通栏按钮 | 同 |
| 11 | PDP 尺寸表 | 手风琴，**宽度只占左侧约 62%**，右侧 `+` | 同（比例吻合） |
| 12 | PDP 推荐位 | 分隔带 + 居中 `You may also like` + **4 列** | 同 |
| 13 | 购物车空态 | `Cart` / `Your cart is empty` / 黑色 `Continue shopping` | 逐字相同 |
| 14 | 登录页 | `Login` / `Enter your email and password to login:` / 黑色 Login / `Don't have an account? Sign up` | 文案一致 |
| 15 | 搜索页 | `Search` 标题 / `N results for "q"` / `Products｜Pages` 分栏 / 左侧 Availability+Price / 右侧排序 / 3 列 | 结构一致 |
| 16 | 页脚 | 黑底、一排居中 faded 链接 + 居中工具行（币种选择器 + 版权） | 结构一致 |
| 17 | 商品价格 | 本地种子价格 = 原站**折后价**（xAI Hoodie $80 / Kids Grok Hoodie $65 / The Core Hoodie $80 均一致） | 数值一致 |

---

## 二、A 级 —— 明显可见的样式偏差

### A1. PDP 规格标签文案与结构

| | 原站 | 本地 |
| --- | --- | --- |
| 显示 | `Size:` （带冒号，**不显示当前选中值**） | `Size XS` （无冒号，组名后跟选中值，透明度 60%） |

证据：原站 PDP 截图 `Size:` + 下拉显示 `XS`；本地截图 `Size XS` + 下拉显示 `XS`。
代码：`src/components/shop/buy-panel.tsx:157-162`

```tsx
<p className="flex items-center gap-3 text-[13px] text-foreground">
  <span>
    {g.name}
    <span className="ml-2 opacity-60">{selections[g.name]}</span>
  </span>
</p>
```

**改法**：标签渲染为 `` `${g.name}:` ``，去掉值的那一层 `<span>`。

### A2. PDP「Add To Cart」按钮多了一个图标

原站按钮是**纯文字** `Add To Cart`；本地在文字前渲染了购物车图标。

代码：`src/components/shop/add-to-cart-button.tsx:71`

```tsx
<ShoppingCart className="mr-1.5 h-4 w-4" />
{pending ? t("Adding…") : t("Add To Cart")}
```

**改法**：删除该图标行。

### A3. PDP 缩略图尺寸 **【2026-09-18 结论反转，见下】**

原站缩略图约 **67px**（@1440），本地约 **57px**（@1280 归一化到 1440）。
比例上本地约为原站的 85%。

> **⚠️ 此条结论方向是错的，已作废。** 原因：thum.io 免费档原生捕获为 **1200×1200**，
> 当时的"原站 1440 图"实际是被**放大 1.2 倍**的 1200 图 → 所有像素测量系统性偏大 20%；
> 而本地截图又是 1280 视口，两边基准都不对。
>
> **2026-09-18 在 1200 视口 1:1 下复测（同一商品 `the-xai-hoodie`）：**
> 原站缩略图 **52×52、纵向间距 20px**；本地 **60×60（选中态 62×62）、间距 8px**。
> → 真实情况是 **本地缩略图偏大 8px、且排列偏密 12px**，与原文"偏小"**方向相反**。
> 详见 **§二之二 → D1/D2**。

### A4. 搜索页排序控件：文案 + 边框

| | 原站 | 本地 |
| --- | --- | --- |
| 触发文案 | `Sort by`（占位符语义） | `Relevance`（显示当前选中值） |
| 外观 | **无边框**，仅文字 + chevron，右对齐；上方有一条横向分隔线 | **有边框方框** |

代码：`src/components/shop/search-sort-select.tsx:39-46`

```tsx
<Select value={currentSort} onValueChange={handleChange}>
  <SelectTrigger className={className} aria-label={t("Sort by")}
    style={{ width: "auto", minWidth: "180px" }}>
    <SelectValue placeholder={t("Sort by")} />   {/* 有值时显示值，不是 "Sort by" */}
```

**改法**：让触发器始终显示 `Sort by`（或改为原站占位语义），并去掉边框样式。

### A5. 搜索页筛选栏：大小写 + 默认展开状态

| | 原站 | 本地 |
| --- | --- | --- |
| 标签文案 | `Availability` / `Price`（首字母大写） | `AVAILABILITY` / `PRICE`（**全大写**） |
| 默认状态 | **折叠**（右侧 chevron 朝下，无内容） | **展开**（开关 / 滑块 / 输入框全部可见） |

代码：`src/components/shop/search-sidebar-filters.tsx:121-130`

```tsx
// 默认展开两个手风琴（shop.x.com 实测默认展开）   ← 该注释与实测不符
const defaultValue = useMemo(() => ["availability", "price"], []);
...
<AccordionTrigger className="py-4 text-[13px] font-medium uppercase tracking-wide ...">
```

**改法**：去掉 `uppercase`；`defaultValue` 改为 `[]`；修正该注释。

### A6. 登录页：框外 label vs 框内 placeholder

| | 原站 | 本地 |
| --- | --- | --- |
| 字段标识 | `E-mail` / `Password` 作为 **输入框内 placeholder** | 作为 **框外 label**（粗体小字，输入框内为空） |
| Forgot 链接 | `Forgot your password?` 位于**密码框内部右侧** | `Forgot password?`（**少了 "your"**）位于**框外上方右侧** |

**改法**：改为 placeholder 形态；补 "your"；Forgot 链接移入框内。

### A7. 页脚条目差异（样式之外的可见差异）

| 位置 | 原站 | 本地 |
| --- | --- | --- |
| 链接行 | `FAQs｜Search｜Accessibility Statement｜Privacy Policy｜Terms and Conditions｜Cookie Consent｜Your Privacy Choices` | `FAQs｜Search｜Accessibility Statement｜Privacy Policy｜Terms and Conditions｜`**`Refund Policy`**`｜Cookie Consent` |
| 工具行 | `🇺🇸 United States (USD $) ▾` · `X Corp © 2024` | `🇺🇸 United States (USD $) ▾` · `© 2026 Ox Shopping` |
| 额外行 | 无 | 多一行 `support@example.com · 400-000-0000` |

- 本地**多出** `Refund Policy`（原站没有此入口）与客服联系方式行
- 本地**缺失** `Your Privacy Choices`（原站有）

代码：`src/components/shop/footer.tsx:9-17`（链接表）、`:59-75`（客服行）

> 说明：`Refund Policy` 是本项目为"退款流程可达"**主动加的**（Phase 11），属于**有意偏离**。
> 若目标是"一模一样"，需要去掉；若按商业合规保留，则属可接受差异 —— 需你拍板。

### A8. 首页横幅文字定位 **【2026-09-18 数值更正，见下】**

归一化到 1440 视口后估算：

| | 原站 | 本地 |
| --- | --- | --- |
| 标题距横幅顶部 | 约 63px | 约 38px（`sm:top-7` = 28px @1280） |
| 标题距左边缘 | 约 64px | 约 56px（`sm:left-12` = 48px @1280） |

> **⚠️ 此条数值不可用（受同一 1.2× 放大问题影响），但"存在垂直偏差"的定性结论成立。**
>
> **2026-09-18 在 1200 视口 1:1 下复测：**
>
> | | 原站 | 本地 |
> | --- | --- | --- |
> | 标题左缘 | **x=48** | **x=48** | 
> | 标题字形纵向 | y **169..214**（高 46） | y **145..190**（高 46） |
> | 标题距 header 底 | **104px** | **80px** |
> | 横幅高度 | 341px | 337px |
>
> → **左缘两端完全一致（都是 48px）**，原文"64 vs 56"是错的；
> 真实偏差只在**垂直方向：本地标题比原站高 24px**（字号/字形高度一致，均为 46px）。
> 详见 **§二之二 → D10/D11**。

### A9. 商品卡 compare-at 价（数据层）

原站每件商品在 HTML 中带 Shopify 的 `Sale price` 语义标签（说明设了 compare-at 价），
但**渲染出来的价格没有划线**（已裁剪放大确认：`xAI Multi Tumbler` 下方只有浅灰 `$50.00`）。

本地种子 `prisma/xcom-catalog.ts` 中 `compareAtPrice` 出现 **0 次**。

**结论**：视觉上一致（都是一行价格），但**数据语义缺失** —— 本地无法表达"促销中"。
若要做到完全一致（含后续可能的划线/促销徽标），需要补 compare-at 数据。

> **2026-09-18 更正**：运行库与镜像文件**不一致**。实测本地 DB 中 `xAI Multi Tumbler`
> 为 `compareAtPrice=60`，前端**确实渲染了划线价 `$60.00` + `SOLD OUT` 角标**，
> 而原站两者都没有。详见 **§五之二 → 数据层发现**。此条从"数据语义缺失"升级为
> "**本地多渲染了原站没有的促销元素**"。

---

## 二之二、桌面端 1:1 复测（2026-09-18 二次取证）

### 为什么要复测

上一轮的桌面测量有两个**基准错误**，导致 A3/A8 等数值失真：

1. **原站侧被放大了 1.2 倍**：thum.io 免费档原生捕获固定为 **1200×1200 浏览器**，
   `width/1440` 只是把 1200 的图**放大到 1440**，并未按 1440 视口渲染。
   → 当时所有"@1440"的像素读数都**系统性偏大 20%**。
2. **本地侧是 1280 视口**（`agent-browser viewport 1440 900` 未生效），与原站不同基准。

**另发现**：`viewportWidth` 免费档**上限为 1200**（500/640/700/900/1000/1024/1200 均正常，
1440 直接返回占位图）。

**本轮基准**：原站 `viewportWidth/1200/width/1200/crop/1200`（1:1）+
本地 Playwright `viewport 1200`（`deviceScaleFactor: 1`）全页截图。**同一商品 `the-xai-hoodie`**。
校验：两侧 header 高度均为 65px，主图顶部均为 y=113。

### D 级 —— 桌面端新确认的偏差（同一商品对比）

| # | 项 | 原站（1200 视口） | 本地（1200 视口） | 差异 |
| --- | --- | --- | --- | --- |
| D1 | **PDP 缩略图尺寸** | **52 × 52** | **60 × 60**（选中态 62） | 本地大 8px |
| D2 | **PDP 缩略图纵向间距** | **20px** | **8px** | 本地密 12px |
| D3 | **PDP 主图** | **592 × 592**，左缘 x=184 | **558 × 558**，左缘 x=180 | 本地小 **34px** → **【见 §二之四 修订为 18px】** |
| D4 | **PDP 信息栏内容宽** | **312px**（加购按钮 x 856..1167） | **336px**（x 816..1151） | 本地宽 24px（**已确认**） |
| D5 | **PDP 右留白** | **33px** ~~（误报）~~ | **49px** | ~~本地多 16px~~ → **【2026-09-18 撤销，见 §二之四】** 原站真实右留白 = 48px，与本地一致 |
| D6 | **PDP 描述段落结构** | **两段**（桌面 7 行：3+4；移动 6 行：3+3） | **一段**（桌面 6 行） | **段落结构丢失** |
| D7 | **PDP 描述行距** | 桌面 **25px** / 移动 **19px** | **21px**（`leading-relaxed`） | 桌面紧 4px |
| D8 | **PDP 描述字号** | 约 14–16px（像素估算） | **13px**（`text-[13px]`，计算样式） | 本地偏小 |
| D9 | **PDP 加购按钮纵向位置** | y = **629** | y = **548** | **本地高 81px** |
| D10 | **首页横幅标题垂直位置** | 距 header 底 **104px** | **80px** | 本地高 24px |
| D11 | 首页横幅高度 | 341px | 337px | 差 4px |

**D9 的 81px 由 D6/D7/D8 叠加而成**（行带检测：原站描述块 236..415 = **180px 高**；
本地 224..337 = **114px 高**，差 66px；其余来自价格→描述、描述→Size 的间距差）。
D6 的根因是**数据管线**：`gen-xcom-seed.cjs` 把原站描述 HTML 拉平成单串，
段落分隔丢失（本地 `<p>` 父容器为 `space-y-4`，但只有一个子 `<p>`）。

### 确认一致（新增，1:1 基准）

| 项 | 原站 | 本地 |
| --- | --- | --- |
| header 高度（桌面） | 65px | 65px ✓ |
| PDP 主图顶部 | y=113（距 header **48px**） | y=113 ✓ |
| PDP 标题字号 | 字形高 **16px**（≈22px） | 字形高 **16px**（计算值 22px）✓ |
| PDP 标题水平宽度 | 146px | 154px（差 5.5%，属可接受） |
| PDP 价格字号 | 移动端字形高 **11px** | 移动端字形高 **11px** ✓ |
| PDP 加购按钮高度 | 46px | 46px ✓ |
| 首页横幅标题左缘 | x=48 | x=48 ✓ |
| 首页横幅标题字形高 | 46px | 46px ✓ |

> 说明：桌面价格宽度原站 52px / 本地 44px 看似差 18%，但**这是阈值侵蚀造成的假象** ——
> 本地价格色为 `rgba(28,28,28,0.6)`，反锯齿边缘更浅，暗像素连通域被削窄。
> 移动端字形高两端均为 11px，故**判定价格字号一致，不建议改动**。

### 新增优先级建议

**低风险、高确定性**

18. D1/D2 PDP 缩略图 `60px → 52px`、间距 `8px → 20px`
19. D4/D5 PDP 信息栏 `336px → 312px`、右留白 `48px → 33px`
    （注：`DESIGN.md §2` 写的"信息栏固定 336px / 桌面 padding 0 48px"与原站实测**不符**）
20. D7 PDP 描述行距 `21px → 25px`
21. D10 首页横幅标题下移 24px

**需先处理数据**

22. D6/D8 PDP 描述：需让种子保留段落分隔（原站描述含 `<p>` 结构），
    并确认描述字号（本地 13px vs 原站约 14–16px）。D3/D9 会随之自然收敛。

---

## 二之三、其余页面复测（搜索 / 登录 / 政策 / 404 / 页脚）

**采集基准**：原站 `viewportWidth/1200/width/1200`（1:1）；本地 Playwright `viewport 1200, dsf 1`。
本轮补齐了此前**只看过截图、未做逐项比对**的页面。

### 先说结论：A4 / A5 / A6 / A7 / B2 全部得到确认

之前这几条是基于桌面截图目测得出的，本轮用 1:1 同视口复测，**结论成立**：

| 旧编号 | 项 | 原站（实测） | 本地（实测） | 结论 |
| --- | --- | --- | --- | --- |
| A4 | 搜索排序控件 | 右上角 **`Sort by ⌄`，无边框**、浅灰文字 | 右上角**带边框的框，且框内无任何文字** | ✅ 确认，且**更严重**（本地框是空的） |
| A5 | 搜索筛选栏 | `Availability` / `Price`，**Title case、默认折叠** | `AVAILABILITY` / `PRICE`，**全大写、默认展开**（含 In stock only 开关 + 价格输入框） | ✅ 确认 |
| A6 | 登录页标签 | **框内 placeholder**（`E-mail` / `Password` 在框内） | **框外粗体 label**，框内为空 | ✅ 确认 |
| A7 | 页脚条目 | 见下方 E13 | 见下方 E13 | ✅ 确认并细化 |
| B2 | 价格筛选币种 | —（原站折叠态不可见） | **`€ 0` / `€ 100`**，而站点币种是 USD | ✅ 确认，**可见 Bug** |

### E 级 —— 页面级新发现

| # | 页面 | 项 | 原站 | 本地 | 性质 |
| --- | --- | --- | --- | --- | --- |
| E1 | 搜索 | **召回范围** | `q=hoodie` → **15 条**（含 `The Retro Crewneck`、`The Core X Crewneck` 等**名称里没有 hoodie** 的商品 → 匹配了描述/标签） | `q=hoodie` → **4 条**，恰好等于名称含 "hoodie" 的商品数 | **功能差异：本地只匹配商品名** |
| E2 | 搜索 | Tab 纵向位置 | `Products \| Pages` 在 y=238 | y=203 | 位置差 35px |
| E3 | 搜索 | 结果区网格 | 卡片宽 **225px** / 间距 **32px** | 卡片宽 **170px** / 间距 **50px** | 本地卡片偏小 |
| E4 | 搜索 | 空查询态 | 居中 `Search` + 居中搜索框（宽 270px） | 居中 `Search` + 居中搜索框（宽 267px） | ✅ 基本一致（本地整体低约 41px） |
| E5 | 政策 | **URL 结构** | `/policies/privacy-policy`、`/policies/refund-policy`（Shopify 标准） | `/policies/privacy`、`/policies/refund` | **URL 不一致** |
| E6 | 政策 | 标题 | **居中** `Refund policy`（约 30px，第二词小写） | **左对齐粗体** `Refund Policy`（24px，第二词大写） | 版式 + 大小写 |
| E7 | 政策 | 正文列宽 / 字号 | **875px**（x 160..1035）、约 15px / 行高 25px | **728px**（x 236..964）、**14px / 行高 20px** | 列窄 147px、字小 1px |
| E8 | 政策 | 内容结构 | 纯段落 + 加粗小节标题（Return Policy / Damages and issues / Exchanges / Refunds） | **编号小节 1./2./3./4. + 项目符号列表** | 内容与版式双重差异 |
| E9 | 404 | **站点外壳** | **有完整 header + footer**，浅灰底 | **无 header、无 footer**，纯白底 | **明显缺陷** |
| E10 | 404 | 文案与按钮 | `We could not find the page you were looking for. Please use the navigation or the button below to go back to our website.` + **黑底** `Continue shopping` | `The page you requested does not exist.` + **白底描边** `Back to home` | 文案 + 按钮样式 |
| E11 | 登录 | 表单列宽 | **440px**（按钮 440×46） | **400px**（按钮 400×46） | 本地窄 40px（按钮高均 46px ✓） |
| E12 | 登录 | `Forgot your password?` | 在**密码框内部右侧**，含 "your" | 在**框外** label 行右侧，文案是 `Forgot password?`（**少 "your"**） | 位置 + 文案 |
| E13 | 页脚 | 链接行 | `FAQs · Search · Accessibility Statement · Privacy Policy · Terms and Conditions · Cookie Consent · Your Privacy Choices` | `FAQs · Search · Accessibility Statement · Privacy Policy · Terms and Conditions · **Refund Policy** · Cookie Consent` | 本地**多 Refund Policy**（插在 Terms 与 Cookie Consent 之间）、**缺 Your Privacy Choices** |
| E14 | 页脚 | 第二行 | `🇺🇸 United States (USD $) ▾ · X Corp © 2024` | `🇺🇸 United States (USD $) ▾ · © 2026 Ox Shopping` | 版权格式不同（公司名前置 vs © 前置） |
| E15 | 页脚 | 行数 | **2 行** | **3 行**（多一行 `support@example.com · 400-000-0000`） | 本地多客服行 |
| E16 | 登录 | 页脚 | **登录页无页脚** | 有完整三行页脚 | 本地多页脚 |

### E9 的根因（可定位）

`src/app/not-found.tsx` 位于**根层**（`(shop)` 路由组之外），而 Header / Footer / CartDrawer /
CookieConsent 全部挂在 `src/app/(shop)/layout.tsx` 里；且**不存在 `src/app/(shop)/not-found.tsx`**。
→ 未匹配路由的 404 只套用根布局，因此拿不到站点外壳。

### 误报排除（重要）

本地搜索页截图里第 4 张卡「The Core Hoodie」**看起来只有标题价格、没有图片**，
一度怀疑是渲染缺陷。用 `networkidle` + 3s 等待后实测：

```
/images/xcom2/unisex-3d-x-... naturalWidth=396 complete=true 230×230 y=769
```

**图片存在且已加载完成**，先前只是**懒加载时序**导致的截图假象。**此条不计入缺陷。**

### 新增优先级建议

**低风险、高确定性**

23. E5 政策页 URL 补 `/policies/privacy-policy` 等 Shopify 标准路径的 **301 重定向**（利于 SEO 与外部链接兼容）
24. E9/E10 404 页补 header + footer、改浅灰底与黑底 `Continue shopping`
25. E4/E2 搜索页筛选栏默认折叠 + Title case（与 A5 同一处改动）
26. E3 搜索页卡片宽 / 间距对齐（225px / 32px）
27. E11/E12 登录页表单列 440px、`Forgot your password?` 移入密码框内右侧并补 "your"
28. E6/E7 政策页标题居中、正文列 875px、字号 15px/行高 25px

**需先决策**

29. **E1 搜索召回范围**：原站匹配描述/标签，本地仅匹配名称。这属于**功能行为差异**，
    改它会动到查询逻辑与索引，建议先确认是否要完全对齐（会影响结果数量与排序）
30. **E13/E14/E15 页脚**：`Refund Policy` 与 `Your Privacy Choices` 的取舍
    （前者涉及合规披露，后者是 CCPA 入口）、是否保留客服行与 ICP
31. **E8 政策页正文**：本地内容为自撰，与原站文本完全不同 —— 需确认是"照抄原站文案"
    还是"保留自撰但改版式"

---

## 二之四、第三轮取证：**基准修正** + PDP 栅格 / PLP / collections / cart / FAQ / 页脚复测

### ⚠️ 基准修正（推翻上一轮的一个结论）

**发现**：thum.io 交付的图像宽度 = 请求宽度，但其**内部布局视口 = 请求宽度 + 16px**，
图像只保留左侧「请求宽度」像素（**右侧 16px 被裁掉**）。

证据（同一页面 `/collections`，用不同 `viewportWidth` 抓取后测 3 列卡片的左右边界）：

| 请求宽度 | 图像宽 | 内容左缘 | 内容右缘 | 图像右侧留白 | 反推布局宽 |
| --- | --- | --- | --- | --- | --- |
| 1000 | 1000 | 48 | 967 | 32 | **1016** |
| 1180 | 1180 | 48 | 1147 | 32 | **1196** |
| 1200 | 1200 | 48 | 1167 | 32 | **1216** |
| 1216 | 1216 | 48 | 1183 | 32 | **1232** |

左缘恒 **48**、图像右侧留白恒 **32**、反推布局宽恒 = 请求宽度 + 16
→ **原站左右内边距实际都是 48px，是对称的**；图像里看到的 32px 右留白是**裁切伪影**。

**因此**：

- **D5（原站右留白 33 vs 本地 49）是误报，予以撤销。** 原站真实右留白 = 48px，与本地一致。
- 上一轮所有「本地 1200 视口」对「原站 1200 图」的**横向位置**比较，都混入了这 16px 差异。
  本轮本地统一改用 **1216 视口**（`/tmp/shots-1216/`），x 坐标可与原站 1200 图直接 1:1 对照。

### 新增取证通道（内容级比对）

沙箱仍封 `shop.x.com`，但 **`https://r.jina.ai/https://shop.x.com/<path>` 可读到原站真实 DOM 文本**。
本轮用它拿到了 `/pages/faqs`、`/collections`、`/collections/all` 的**逐字内容与链接 href**，
把「像素猜内容」升级为「内容级比对」。

### D 级修订（同一商品 `the-xai-hoodie`，原站布局 1216 vs 本地 1216）

| # | 项 | 原站 | 本地 | 修订后差异 |
| --- | --- | --- | --- | --- |
| D1 | PDP 缩略图 | 图 **52×52** / 元素盒 **56×56** | 图 **58×58** / 盒 **60×60** | 本地图大 **6px**（确认） |
| D2 | PDP 缩略图间距 | 图间距 **20px**（盒间距 16） | 图间距 **10px**（盒间距 8） | 本地密 **10px**（确认） |
| D3 | PDP 主图 | **592×592** | **574×574** | 本地小 **18px**（原记 34px） |
| D4 | PDP 信息栏宽 | **312px** | **336px** | 本地宽 **24px**（确认） |
| D5 | PDP 右留白 | **48px** | **48px** | ✅ **无差异（撤销）** |
| D6–D11 | 描述段落 / 行距 / 字号 / 按钮纵向位置 / 横幅 | — | — | 维持原结论 |

新增确认一致：主图顶部 **y=113** ✓；主图右缘与信息栏右缘均贴容器右缘 ✓；
原站栅格**列间距 80px**（本地 48px）；缩略图元素盒左缘原站 x=48 ✓。

### F 级 —— 本轮新发现（原站有实测值，本地可定位到源码）

**F1. PDP 容器左内边距 10px（应为 48px）—— 内容整体左移 38px**

`src/app/globals.css`：

```css
@media (min-width: 1024px) {
  .pdp-shell { padding-left: 0.625rem; /* 10px */ padding-right: 3rem; /* 48px */ }
}
```

注释写「官方 PDP 桌面端左边距略小、右边距更大」——**该前提经实测为误判**（原站左右均 48px，见上文基准修正）。
后果：PDP 的缩略图轨 / 主图 / 信息栏**整体左移 38px**（实测缩略图左缘 40 vs 原站 48）。

**F2. PDP 栅格列间距 48px（应为 80px）** — `page.tsx` 用 `lg:gap-x-12`（48px），原站实测 **80px**。

**F3. PDP 信息栏固定 336px（原站为比例列 ≈ 28%）** — 原站信息栏随视口缩放：

| 布局宽 | 1040 | 1216 | 1232 | 1316 |
| --- | --- | --- | --- | --- |
| 信息栏宽 | 266 | 312 | 317 | 342 |
| 占内容宽 | 28.2% | 27.9% | 27.9% | 28.0% |

原站栅格 ≈ **`7fr / 80px / 3fr`**（校验：1216 布局 → 内容 1120 → 可用 1040 → 728 / 312，
与原站实测 **728 / 312 完全吻合**）。本地 `lg:grid-cols-[minmax(0,1fr)_336px]` 是固定像素列。

**F4. PLP（原站 `/collections/all`）网格间距 12px（应为 48px）—— 最明显的可见差异**

| 项 | 原站 | 本地 | 差异 |
| --- | --- | --- | --- |
| 容器内容区 | 48..1167（1120，padding 48） | 50..1165（1115，padding 50） | -2 |
| 列数 | 3 | 3 | ✅ |
| 卡片图 | **341×341** 正方形 | **364×364** 正方形 | 本地大 23px |
| **列间距** | **48px** | **12px** | 本地密 **36px** |
| 行间距（行 pitch） | 470px | 516px | 本地大 46px |
| 首图顶部 | y=280 | y=200 | 本地高 80px |
| 标题→首图 | 122px | 58px | 本地少 64px |
| 标题 | `Products`，居中，字形高 22px（y 137..158） | `Products`，居中，字形高 20px（y 123..142） | 文案 ✅ / 本地高 14px |
| 商品数 | 22（2 件 Sold out） | 见 DB | 需对数据 |
| 计数文字 / 筛选 / 排序 / 分页 | 全部**无** | 全部**无** | ✅ |

**F5. `/collections` 背景色** — 原站 `rgb(239,239,239)` 浅灰；本地 `rgb(255,255,255)` 纯白。

**F6. `/collections` 卡片比例** — 原站 **353×353 正方形**；本地 **356×445（4:5 竖版）**。

**F7. `/collections` 卡片标题位置** — 原站标题**叠在卡片内左下角**（白字 + 深色渐变遮罩）；
本地标题在卡片**下方**（深色字）。原站卡片**无数量副标题**，本地多渲染 `N items`。

**F8. `/collections` 栅格** — 原站卡片 353 / 列间距 **30** / 行间距 **30**；本地卡片 356 / 列间距 **25**。

**F9. `/collections` 数据量** — 原站 **4 个**：

| 标题 | href |
| --- | --- |
| `Mens` | `/collections/mens` |
| `SpaceXAI Collection` | `/collections/xai-collection` |
| `Womens` | `/collections/womens` |
| `X Collection` | `/collections/x-collection` |

本地 **2 个**（`X Collection` 17 items / `Ox Collection` 20 items）。

**F10. `/cart` 内容整体下移约 50px** — 原站 标题 y=336 / 副标题 y=383 / 按钮 y=434；
本地 386 / 429 / 474（各下移 50 / 46 / 40px）。

**F11. `/cart` 内部间距** — 原站 标题→副标题 35px、副标题→按钮 38px；本地 30px / 32px。
（文案 `Cart` / `Your cart is empty` / `Continue shopping` 逐字一致 ✅，字号一致 ✅）

**F12. `/cart` 按钮** — 宽 原站 **174px** / 本地 **170px**；底色 原站 **`rgb(28,28,28)`** / 本地 **`rgb(23,23,23)`**。

**F13. `/pages/faqs` 内容形态完全不同（最大功能级差异）**

原站：`<h1>FAQs</h1>` + **10 组「加粗问题段落 + 散文答案段落」**，无手风琴、无联系卡片。
本地：**2 条 `<details>` 手风琴 + 一个 `Contact us` 卡片**。

原站 10 个问题（r.jina.ai 逐字取得）：

1. I have a general product question regarding an item from the X Shop. Who can I contact?
2. What do I do if I need to make changes to my order?
3. How soon will my order be processed and how will I know when it has been shipped?
4. How can I track my order?
5. There is a problem with my shipment/my order never arrived - what should I do?
6. What types of payment do you accept?
7. Do you accept exchanges?
8. Can I return a product purchased from a third party?
9. Am I eligible for a return?
10. How do I return a product?

正文几何（原站）：正文列 x 268..946（**679px**）、22 个文本行、段内行距 24–25px、块间距 32px。
本地容器 x 269..946（**678px**）——**容器完全一致**，差异只在内容形态与行数。

**F14. FAQ 标题文案** — 原站 `FAQs`（字形 y 138..160）；本地 `FAQs · Frequently Asked Questions`（y 130..156）。
字号一致（28px）；本地标题**高 8px**。

**F15. 页脚行数** — 原站 **2 行**；本地 **3 行**（多出 `support@example.com · 400-000-0000` 一行）。

**F16. 页脚链接集** — 原站 7 条（**含 `Your Privacy Choices`** → `/pages/data-sharing-opt-out`，**无** Refund Policy）；
本地 7 条（**含 `Refund Policy`**，**无** `Your Privacy Choices`）。
`footer.tsx` 顶部注释自称 "exact link list, order and labels"，**与事实不符**。

**F17. 页脚版权** — 原站 `X Corp © 2024`（品牌在前）；本地 `© 2026 Ox Shopping`（年份在前）。

**F18. 页脚垂直节奏** — 原站 padding-top **70** / 两行间距 **62** / padding-bottom **50**（总高 211）；
本地 70 / **47** / **66**（总高 249）。

**F19. 页脚外链目标** — 原站 `Privacy Policy` → `https://x.com/en/privacy`（**站外**）、
`Cookie Consent` → `/?preview_privacy_banner=1`；本地均为站内路由。

**F20. 各页容器宽度不统一（本地自身的一致性缺陷）**

| 页面 | 本地内容区 | 内边距 |
| --- | --- | --- |
| `/products`（PLP） | 20..1196 | 20 |
| `/collections` | 50..1166 | 50 |
| PDP | 10..1168 | 10 / 48 |
| `/pages/faqs` | 720 max-w（268..948） | 20 |
| `/policies/*` | 728 max-w（244..972） | — |

原站只有两套：**48px 内边距的全宽容器**（PLP / collections / PDP，内容 1120）
+ **720px 居中容器**（FAQ 等内容页）。
本地 FAQ 的 720px 容器与原站**完全一致**（268..948 vs 268..946），是全站唯一对齐的容器。

### 新增优先级建议

**低风险、高确定性**

| # | 项 | 改动 |
| --- | --- | --- |
| 23 | F1 | `.pdp-shell` 左内边距 `10px → 48px`（并修正注释里的错误前提） |
| 24 | F2 | PDP 栅格 `lg:gap-x-12 → lg:gap-x-20`（48 → 80px） |
| 25 | F5 | `/collections` 背景改 `rgb(239,239,239)` |
| 26 | F6/F7 | `/collections` 卡片改正方形 + 标题叠卡内左下（白字 + 渐变遮罩）、去掉 `N items` |
| 27 | F4 | PLP 列间距 `12px → 48px`（**最显眼的网格差异**） |
| 28 | F10/F11 | `/cart` 上边距减 50px、内部间距 30/32 → 35/38 |
| 29 | F12 | `/cart` 按钮宽 174px、底色 `#1C1C1C` |
| 30 | F16 | ✅ 已决（2026-09-18）：一律以原站为准 —— 页脚补 `Your Privacy Choices`、**移除** `Refund Policy`；页面保留、经站内搜索可达 |
| 31 | F17 | 页脚版权文案改 `X Corp © 2024` 形态（品牌在前） |
| 32 | F18 | 页脚垂直节奏对齐（行间距 62px、padding-bottom 50px） |
| 33 | F20 | 统一容器：PLP 20→48、collections 50→48 |
| 34 | F14 | FAQ 标题去掉 ` · Frequently Asked Questions` |

**需先拍板（内容 / 数据 / 结构）**

35. **F13** FAQ 内容形态：是否改为「10 组散文问答」；若采用，需把原站问答文本灌入 `prisma.faq` 或改为静态页
36. **F9** collections 数据：补 `Mens` / `SpaceXAI Collection` / `Womens` 三个分类
37. **F3** PDP 信息栏改比例列（`7fr / 3fr`）—— 会同时影响断点行为，建议与 F1/F2 一起改
38. **F19** 页脚外链目标是否改为站外（涉及合规文档托管位置）

---

## 三、B 级 —— 功能缺口（原站有、本地无）

### B1. 商品卡「快速加购」已不存在（三处文档均记载存在）

**实测：`src/` 全仓搜索 `Quick add` / `quick-add` / `QuickAdd` 零命中。**

- `docs/DESIGN.md §3` 表格写着「快速加购：hover 时右下白色圆钮滑入，图标旋转 90°，点击真实加购并弹抽屉」→ **未实现**
- `src/components/shop/product-card.tsx:49` 注释写着「hover swaps to the second image and **slides in the quick-add circle**」→ **注释过期**，该文件（143 行）内无任何快速加购代码
- `findings.md` 记录「qa-interactions 通过：27 商品卡、hover 快速加购 5 钮」→ **记录失真**

**改法**：需先确认原站（Shopify Impact 主题）商品卡 hover 的确切形态（Quick add / Choose options），再实现。
`product-card.tsx` 目前是**服务端组件**，加交互需要拆出客户端子组件。

### B2. 搜索页价格筛选硬编码 `€` 符号（可见 Bug）

站点默认币种是 USD（页头显示 `USD $`），但价格筛选输入框前缀写死为 `€`。

代码：`src/components/shop/search-sidebar-filters.tsx:164` 与 `:179`

```tsx
<span className="absolute left-2 top-1/2 -translate-y-1/2 ...">€</span>
```

实拍证据：本地搜索页显示 `€ 0` `to` `€ 100`，同页页头却是 `USD $`。
注释也写错了：「（默认币种 EUR，与商品价格格式一致）」。

**改法**：改用当前币种符号（走 `useCurrency()`），并修正注释。

### B3. 结算强制登录（原站允许游客结账）—— ✅ 已于 2026-09-18 修复

- 原状：`src/components/shop/checkout-flow.tsx:202-203` 捕获 401 后 `window.location.href = "/auth/login?next=…"`
- 原站：Shopify 标准 Checkout，默认允许游客结账
- **现状**：游客可直接下单。`POST /api/orders` 不再要求登录，订单以 `userId = null` 落库并
  签发 `accessToken`（免登录查单凭证）；联系邮箱作为唯一身份线索。
- 端到端验证（2026-09-18）：游客下单成功，`orders.userId` 为空、`accessToken` 非空；
  凭令牌可查单 / 下载发票，无令牌既查不到详情也拿不到发票（防越权已生效）。
- 账户侧仍保留登录用户的订单列表，游客订单通过「凭订单号 + 邮箱 / 令牌」入口查看。

### B4. 无优惠券 / 折扣码 —— ✅ 已于 2026-09-18 实现

原状：全仓无 `Coupon` 模型、无 `coupon`/`discountCode` 实现，`Order.discount` 字段空置。

**现状**（已实现，且超出「仅支持折扣码」的最小范围）：

| 层 | 落地内容 |
| --- | --- |
| 数据 | `Coupon`（`code` / `type` / `value` / `minSpend` / `maxDiscount` / `startsAt` / `endsAt` / `usageLimit` / `usedCount` / `perUserLimit` / `isPublic` / `isActive` / 中英文标题与描述）、`CouponRedemption`（券↔订单↔用户/邮箱的唯一凭证，级联删除已按「保留溯源」原则收紧） |
| 券类型 | `PERCENTAGE`（可设封顶 `maxDiscount`）、`FIXED`、`FREE_SHIPPING` |
| 校验 | 有效期、门槛 `minSpend`、总量上限 `usageLimit`（0 = 不限）、每人限次 `perUserLimit`（按 `userId`，游客按邮箱）、启用开关、公开露出需有文案 |
| 前台 | 领券中心 `/coupons`（仅列 `isPublic` 且生效中的券，卡片带一键复制券码）、我的折扣码 `/account/coupons`（可用 / 已用 / 已过期分区） |
| 结账 | `POST /api/coupons/apply` 试算 + 下单时服务端复算，`Order.discount` / `couponId` / `couponCode` 落库 |
| 后台 | `/admin/coupons` 列表（分页 / 启停开关 / 编辑 / 删除），`POST|PUT|PATCH|DELETE /api/admin/coupons[/id]`，全部操作写审计 |
| 一致性 | 下单事务内 `usedCount` 自增 + 写核销记录；取消订单在同一事务内回补计数并删核销记录（已实测 `SAVE15` 取消后 `usedCount` 回到 0） |

**已修的缺陷**：列表开关原本发 `PATCH` 而路由只实现 `PUT` → 405；已补 `PATCH` 处理器
（`couponToggleSchema` 仅接受 `isActive`，避免开关走全量 PUT 时字段漂移）。
**刻意的边界**：已有核销记录的券**禁止物理删除**（会断掉历史订单的优惠溯源），只能停用；
总量上限不得低于已核销数。

### B5. 商品评价 / 评分 —— ⚠️ 伪缺口：**原站也没有**，不应新增

`schema.prisma` 无 `Review` 模型；全仓无 `aggregateRating` / `ratingValue`。

**2026-09-18 复核结论：这不是缺口。** 原站 PDP **同样没有**任何评价/评分体系，
本地「没有评价」才是与原站一致的状态。按「一律对齐原站」的口径，
新增评价功能属于**偏离原站**，不是补齐。

复核取证（两条独立通道 × 两个商品，全部零命中）：

| 通道 | 对象 | 检索/观察 | 结果 |
| --- | --- | --- | --- |
| DOM 文本（`r.jina.ai`） | `/products/x-icon-t-shirt` | `review / rating / star / aggregateRating / Write a review / Be the first / judge.me / loox / okendo / yotpo / stamped` | 零命中 |
| DOM 文本（`r.jina.ai`） | `/products/the-grok-hoodie` | 同上 | 零命中 |
| 整页截图（`image.thum.io` 1200×1647） | `/products/x-icon-t-shirt` | 肉眼逐块核对 | 无评价区 |

原站 PDP 真实区块顺序（截图可读）：
header → 图库 → 标题 → 价格 → 描述 → **Size 下拉** → 数量步进器 → `Add To Cart`
→ **`Size Chart` 折叠项** → `You may also like`（居中标题，轮播）→ 页脚。

**为什么此前被误列为缺口**：`20260910042551_drop_reviews_coupons` 的注释把
「评价」与「优惠券」写在同一句「原站没有」里。这句对**优惠券是错的**（已恢复实现，
见 B4），对**评价是对的**。我一度因为前者被推翻而把后者一并反转 —— 属过度推广。
教训：一条注释里的多个论断要**分别**取证。

**改法**：不改代码。已在 `GAP_ANALYSIS §七` 记录取证过程。
若将来确实要加评价，须作为产品决策写进 `DESIGN.md §2「与原站的有意差异」`。

> 另：`DESIGN.md §3` 曾称 PDP JSON-LD 含「评分」，该记载**已于 2026-09-18 修正为
> 「名称/描述/图/分类/价格/库存」**（见 `GAP_ANALYSIS §2.4`），与本节结论一致。

---

## 四、C 级 —— 交互/行为差异（需人工确认原站真实行为）

> 这几条我**无法从静态截图判定**，因为原站的点击行为需要真实交互才能观察（沙箱无法交互原站）。
> 列出待确认清单，避免凭猜测改动。

| # | 项 | 本地行为 | 原站行为 | 待确认方式 |
| --- | --- | --- | --- | --- |
| C1 | 页头 `Search` 点击 | 打开**搜索弹层**（`SearchOverlay`，输入 ≥2 字符 250ms 防抖联想） | 可能是跳转 `/search` 页（因该页存在且带完整筛选/排序/分栏） | 人工点击原站 |
| C2 | 页头 `Cart (0)` 点击 | 打开**侧滑抽屉**（`CartBadge` → `cart:open`） | 可能打开抽屉，也可能跳 `/cart` | 人工点击原站 |
| C3 | 商品卡 hover | **换第二张图**（0.2s opacity 切换）+ 无快速加购 | 需确认是否有 Quick add / Choose options | 人工 hover 原站 |
| C4 | 分类横幅 hover | 图片慢速放大 `scale 1.06`（5s ease-out） | 需确认是否有缩放动效 | 人工 hover 原站 |

**已实现且 DESIGN.md 有记载的动效**（未逐项与原站核对，因静态截图无法呈现）：
滚动显现 `reveal.tsx`（IntersectionObserver fade-up）、描边按钮 `.btn-sweep` 左→右扫入、
文字链接下划线左划、购物车抽屉 300ms 滑入、灯箱放大、吸顶头部下滑隐藏/上滑出现、
`prefers-reduced-motion` 全局降级。

### C1 的新增证据（2026-09-18，仍不构成定论）

本轮拿到了原站 `/search` 页的 1:1 渲染，可用于推断 C1，但**仍不足以定论**：

- **原站确实有功能完整的 `/search` 页**：空查询时是「居中 `Search` 标题 + 居中搜索框」；
  带查询时是「`Search` 标题 + `N results for "…"` + `Products|Pages` 双 Tab +
  左筛选栏 + 右上 `Sort by` + 3 列结果」。
- 原站页头的 `Search` 是**文字链接**（与 `Login`、`Cart (0)` 并列），不是图标按钮。
  Shopify 主题里文字链接通常**导航**，图标才常见弹层 —— 但 Impact 主题也存在
  文字链接触发弹层的配置，**因此不能据此断言**。
- 本地 `/search` 页**已存在且形态一致**（见 §二之三 E2–E4），所以无论 C1 结论如何，
  两个交互面都在，改动成本可控。

**建议**：仍由人工在原站点击 `Search` 一次确认。若确认是跳转，则本地应把页头改为
`<Link href="/search">`；若是弹层，则本地 `SearchOverlay` 的**结果页**仍需与
`/search` 页保持一致（当前两者是两套实现）。


---

## 五、记录失真清单（建议同步修正文档）

| # | 位置 | 错误记载 | 实际 |
| --- | --- | --- | --- |
| 1 | `findings.md` Phase 2「修复1 header 右侧顺序」 | 称「DESIGN.md §2 规范是 币种/**搜索**/登录/购物车」，据此把代码改成 币种/搜索/登录 | **DESIGN.md 原文是 币种/登录/搜索/购物车**，与原站一致。当前 `header.tsx:51-53` 已是正确顺序（CurrencySelect → UserMenu → SearchOverlay）——**该"修复"记录是错的，若照它改会把正确实现改坏** |
| 2 | `docs/DESIGN.md §3` | 快速加购「已落地」；PDP JSON-LD 含「评分」 | 快速加购确未实现（见 B1）；「评分」一条**已修正**，且复核确认**原站也没有评分**（见 B5），故 JSON-LD 不含 `aggregateRating` 是正确的 |
| 3 | `product-card.tsx:49` 注释 | 「slides in the quick-add circle」 | 代码中无快速加购 |
| 4 | `search-sidebar-filters.tsx:120` 注释 | 「shop.x.com 实测默认展开」 | 原站实测**折叠** |
| 5 | `search-sidebar-filters.tsx:160` 注释 | 「默认币种 EUR」 | 站点默认 **USD** |
| 6 | `docs/PRODUCTION_CHECKLIST.md` | 提到「券计数…校验 `usageLimit`」 | 该记载**原为失真**（当时无优惠券体系）；2026-09-18 优惠券落地后**已成立**，文档已改为「已过时」批注并指向券上线检查项 |
| 7 | `docs/DESIGN.md §2` | 「lg 以上左侧扁平筛选栏」（指列表页） | 列表页**有意无筛选**（对齐原站），筛选只在搜索页 |

---

## 五之二、移动端 / 响应式专项审计（2026-09-18 补测）

### 采集方法（重要：之前的方法不可用）

之前几轮审计**没有覆盖移动端**，原因是拿不到原站的真实小屏渲染。本轮解决了：

| 手段 | 结果 |
| --- | --- |
| `https://image.thum.io/get/width/390/...` | ❌ 免费档捕获固定为 **1200×1200 浏览器**，`width/N` 只缩放输出图，**不改变布局** |
| 请求 `viewportWidth/390` | ⚠️ 被 **Chrome 最小窗口宽度（约 500px）**夹住 → 按 ~500px 布局再裁到 390，右侧内容被切掉（看起来像"横向溢出"，实为**裁切假象**） |
| 请求 `viewportWidth/1440`（>1200） | ❌ 返回 thum.io **占位图**（字节数固定、全白）。**免费档 `viewportWidth` 上限 = 1200**。500/640/700/900/1000/1024/1200 均正常 |
| **`viewportWidth/1200/width/1200`** | ✅ **桌面端 1:1 基准**（1200 视口、1200 输出，无缩放）。**上一轮"1440 图"其实是它放大 1.2 倍**，导致所有 @1440 像素读数偏大 20% |
| **`iphoneX/width/375/...`** | ✅ **真机视口 375**，本轮全部移动端证据的来源 |
| `fullpage/` | ✅ 可用（返回整页；免费档单次捕获高度上限 1200px） |
| `wait/N`、`noanimate/` | ✅ 可用（文档标注为付费档，实测免费档亦生效） |
| 文本代理 `r.jina.ai` / `allorigins` / `corsproxy` / `codetabs` | ❌ 本沙箱**全部不可达**（控制组 `example.com` 亦失败，属环境封锁） |

**正确取原站移动端截图：**
`https://image.thum.io/get/iphoneX/width/375/crop/1200/wait/8/noanimate/<URL>`

### 原站 header 实测：**三段式**响应式（此前文档未记载）

用像素扫描（纯黑行/亮像素包围盒）逐档测量，得到原站页头的真实断点：

| 视口宽度 | header 高度 | Logo 位置 | 右侧构成 |
| --- | --- | --- | --- |
| 375 / 500 / 640 / 680 | **59px** | **居中** | 搜索 + 购物车（2 个**图标**） |
| 700 / 768 / 900 / 950 | **65px** | **居中** | 账户 + 搜索 + 购物车（3 个**图标**） |
| 1000 / 1024 / 1200 | **65px** | **左对齐 48px** | 币种(🇺🇸USD ▾) + Login + Search + Cart (n)（**文字**） |

两个断点：**700px**（header 高度 59→65，右侧 2→3 项）、**1000px**（Logo 居中→左对齐，图标→文字）。

375 视口下原站 header 精确值：Logo 亮区 `x 153..211`（宽 59，中心 182.0，**比视口中心偏左 5.5px**）；
搜索图标 `x 299..315`；购物车图标 `x 335..352`；右留白 23px。

### 已确认一致 ✅

1. **移动端 header 构成**：Logo + 搜索图标 + 购物车图标，**无汉堡菜单、无币种、无 Login** —— 与原站 <700px 一致
2. **图标位置**：原站 搜索 299–315 / 购物车 335–352 ↔ 本地 搜索 293–317 / 购物车 331–355（差 2–4px）；右侧留白均 23px
3. **PLP**：2 列网格、标题 `Products` 居中、卡片标题与价格均居中、商品图灰底
4. **PDP**：移动端用**居中圆点指示器**（非缩略图轨），圆点数量随图数变化（原站 3 点 / 本地 5 点，属商品差异）
5. **横向溢出**：本地 `/`、`/collections`、`/products`、PDP、`/cart`、`/checkout`、`/search`、`/auth/login` 在 375 与 768 下**全部 0px**（`node scripts/qa/qa-mobile.mjs`）。
   另补测 14 条未覆盖路由（`/policies/{privacy,terms,refund,cookies}`、`/pages/{faqs,accessibility-statement}`、
   `/orders`、`/auth/{register,forgot-password}`、`/checkout/result`、`/collections`、404 兜底）
   在 375 与 768 下**同样全部 0px**。
   （`/account`、`/account/addresses` 在未登录时跳转 `/auth/login`，测量脚本因上下文销毁报 FAIL，
   属**跳转竞态而非布局缺陷** —— 768 下 `/account` 正常返回且 `h1="Login"`。）

### 确认的偏差 ❌

| # | 项 | 原站（实测） | 本地（实测） | 量级 |
| --- | --- | --- | --- | --- |
| M1 | **移动端 header 高度** | **59px**（<700px） | **65px**（全宽度固定） | +6px |
| M2 | header 高度断点 | **700px** | 无（恒定 65px） | 结构缺失 |
| M3 | Logo 对齐断点 | **1000px** | **640px** | 不一致 |
| M4 | **640–999px 区间的 header** | 700–999：65px + **Logo 居中** + 3 图标<br>640–699：59px + **Logo 居中** + 2 图标 | 640–767：Logo **左对齐 48px** + 搜索/购物车<br>768–999：Logo **左对齐 48px** + 币种/Login/搜索/购物车 | **结构性不一致** |
| M5 | 移动端 Logo 水平位置 | 中心偏左 5.5px（左缘 **153px**） | 正中（左缘 155px，中心 188） | ~5px |
| M6 | **PLP 容器内边距** | **10px** | **20px** | 2× |
| M7 | **PLP 卡片横向间距** | **10px** | **20px** | 2× |
| M8 | PLP 卡片图片尺寸 | 173 × 172 | 158 × 158 | 窄 15px |
| M9 | **PDP 主图** | **满宽出血 375×375，紧贴 header（上间距 0）** | 335×335，**左右各 20px + 上间距 48px** | 明显 |
| M10 | PDP 圆点距主图 | 约 25px | 约 17px | 8px |
| M11 | **商品角标** | **无** | 有（`SOLD OUT` / `HOT`） | 数据层 |
| M12 | **划线价** | **无**（仅浅灰 `$50.00`） | 有（`$50.00` ~~`$60.00`~~） | 数据层 |
| M13 | 商品顺序 / 内容 | Dad Hat → Logo Tee → Trucker Hat → Kids Hoodie | Dad Hat → Logo Tee → **Reflective Tee** → Trucker Hat | 数据层 |
| M14 | Cookie 同意横幅 | 未出现 | 出现 | 待确认 |
| M15 | PLP 标题字号 | 约 20px | 约 22px | ~2px |

> M6–M9 的几何数据由脚本自动识别商品图灰底矩形（`rgb(217,217,217)`）得到，非目测。
> 校验：原站 `10+173+10+172+10 = 375` ✓；本地 `20+158+20+157+20 = 375` ✓（两者都刚好占满视口，说明差异纯粹来自 padding/gap 取值）。

### 数据层发现（解释 M11–M13）

本地运行库中 `xAI Multi Tumbler` 为 `price=50, compareAtPrice=60, stock=0`
→ 前端因此渲染 **`SOLD OUT` 角标 + 划线价 `$60.00`**。

但 `prisma/xcom-catalog.ts`（文件头自称 "mirror of shop.x.com catalog"）中
`compareAtPrice` 出现 **0 次**。即 **运行库数据 ≠ 镜像文件**，且原站既不显示角标也不显示划线价。

→ 这**不是**渲染 Bug，而是**数据源不一致**。要"一模一样"，需让运行库与镜像文件对齐（并把 `stock` 恢复为非 0）。

### 对 §六 优先级的补充

**新增（低风险、高确定性）**

12. M6/M7 PLP 移动端 `padding` 与 `gap`：`20px → 10px`
13. M9 PDP 移动端主图去掉 `20px` 内边距与 `48px` 上间距（改为满宽出血、紧贴 header）
14. M1 移动端 header 高度 `65px → 59px`（<700px）

**需先拍板**

15. M2/M3/M4 header 三段式：本地现在是"640 切 Logo 对齐 / 768 切导航"的**两段式**，
    与原站"700 切高度 / 1000 切对齐"不同。改造成本不小，且 640–999 区间属平板场景，
    **建议先确认是否值得为平板形态做像素级复刻**
16. M11–M13 数据源：需决定以运行库还是以 `xcom-catalog.ts` 为准

**低优先**

17. M5 Logo 5px 偏移、M10 圆点间距 8px、M15 标题字号 2px —— 亚 10px 级，建议不单独改动

---

## 六、修改优先级建议

**第一批（低风险、高确定性，建议直接改）**

1. A1 规格标签 → `Size:`
2. A2 去掉 Add To Cart 图标
3. B2 价格筛选 `€` → 动态币种符号（**这是可见 Bug**）
4. A5 筛选栏去 `uppercase`、默认折叠
5. A4 排序控件文案改 `Sort by`、去边框
6. A6 登录页改 placeholder 形态

**第二批（需要先拍板或先确认原站行为）**

7. A7 页脚：`Refund Policy` 与 `Your Privacy Choices` 的取舍（合规 vs 一模一样）
8. B1 快速加购：先确认原站形态再实现（需要拆客户端组件）
9. C1–C4 交互行为：**先人工在原站点一遍**，拿到结论再动代码
10. A8/A3 精测确认后再调数值

**第三批（文档卫生）**

11. 修正第五节的 7 条失真记录 —— 尤其第 1 条，**它会让后续改动走向错误方向**

---

## 附录：证据文件

| 文件 | 内容 |
| --- | --- |
| `/tmp/cmp/r-home.png` | 原站首页（1440） |
| `/tmp/cmp/r-collection2.png` | 原站分类落地页（1200） |
| `/tmp/cmp/r2-pdp.png` | 原站 PDP（1200） |
| `/tmp/cmp/r2-cart.png` | 原站购物车 + 页脚（1200） |
| `/tmp/cmp/r2-login.png` | 原站登录页（1200） |
| `/tmp/cmp/r2-search.png` | 原站搜索页（1438） |
| `/tmp/cmp/local-header.png` | 本地首页首屏（1280） |
| `/tmp/cmp/l-pdp.png` | 本地 PDP（1270） |
| `/tmp/cmp/l-search.png` | 本地搜索页（1270） |
| `/tmp/cmp/l-login.png` | 本地登录页（1270） |
| `/tmp/cmp/local-cart.png` | 本地购物车（1270） |

移动端证据（2026-09-18 补测）：

| 文件 | 内容 |
| --- | --- |
| `/tmp/cmp/iPX-home.png` | 原站首页 iPhone X 真机视口（375×1200） |
| `/tmp/cmp/iPX-pdp.png` | 原站 PDP（375×1200） |
| `/tmp/cmp/iPX-plp.png` | 原站 `/collections/all`（375×1200） |
| `/tmp/cmp/iPX-cart.png` | 原站购物车（375×1200） |
| `/tmp/cmp/W700.png` | 原站 700 视口（证明 65px + 居中 Logo + 3 图标） |
| `/tmp/cmp/X1000.png` | 原站 1000 视口（证明 Logo 转为左对齐 48px） |
| `/tmp/cmp/V500.png` / `V640.png` / `W680.png` | 原站 500 / 640 / 680 视口（均 59px） |
| `/tmp/cmp/CMP-plp.png` | 本地 vs 原站 PLP 移动端并排 |
| `/tmp/shots-mobile/375_*.png` | 本地 375 视口全站截图（`qa-mobile.mjs` 产出） |

测量脚本（临时，位于 `/tmp/cmp/`）：
`hh.mjs`（header 高度）、`measure3.mjs`（亮像素横向分组）、
`cards.mjs`（商品图灰底矩形识别）、`prof.mjs`（逐行亮度剖面）、
`mobile-metrics.mjs`（Playwright 多视口 DOM 测量）。

桌面 1:1 复测证据（2026-09-18 二次取证）：

| 文件 | 内容 |
| --- | --- |
| `/tmp/cmp/N-pdp1200.png` | 原站 PDP `the-xai-hoodie`（1200 视口 **1:1**） |
| `/tmp/cmp/N-home1440.png` 等 | 证明 `viewportWidth/1440` 返回占位图（免费档上限 1200） |
| `/tmp/shots-1200/*.png` | 本地 1200 视口 1:1 全页截图（home/pdp/plp/search/cart + hoodie） |
| `/tmp/cmp/CMP-info.png` | 同商品 PDP 信息栏并排（左本地 / 右原站） |

测量脚本（桌面 1:1）：
`ccl.mjs`（暗像素连通域包围盒）、`lines.mjs`（文本行带/行距/段落检测）、
`bright.mjs`（亮像素连通域 + 暗区纵向范围）、
`pdp-styles.mjs` / `desc-style.mjs`（Playwright 计算样式）。

页面级复测证据（2026-09-18 第三次取证，原站 1200 视口 1:1）：

| 文件 | 内容 |
| --- | --- |
| `/tmp/cmp/O-search.png` | 原站 `/search` 空查询态 |
| `/tmp/cmp/O-searchq.png` | 原站 `/search?q=hoodie`（15 条 + 双 Tab + 筛选 + Sort by） |
| `/tmp/cmp/O-login.png` | 原站 `/account/login` |
| `/tmp/cmp/O-pol-refund.png` / `O-pol-privacy.png` | 原站 `/policies/refund-policy` / `privacy-policy` |
| `/tmp/cmp/O-404.png` | 原站 404 |
| `/tmp/cmp/O-faqs.png` | 原站 `/pages/faqs` |
| `/tmp/shots-1200/searchq-1200.png` / `login-1200.png` / `pol-*-1200.png` / `404-1200.png` | 本地对应页面（1200 视口 1:1） |

脚本：`shot-pages.mjs`（批量截取本地页面）、
`check-search-policy.mjs`（商品图完整性 + 政策页正文几何）。

第三轮取证（2026-09-18 第四次取证：基准修正 + 1216 对齐）：

| 文件 | 内容 |
| --- | --- |
| `/tmp/cmp/T-vp1000.png` / `T-vp1180.png` / `T-vp1200.png` / `T-vp1216.png` | 证明「布局宽 = 请求宽 + 16、图像裁右侧 16px」 |
| `/tmp/cmp/T-P1024.png` … `T-P1300.png` | 原站 PDP 四个视口宽度（推导 7fr/3fr 比例列） |
| `/tmp/cmp/T-ALL1200.png` | 原站 `/collections/all`（PLP 1:1） |
| `/tmp/cmp/O-collections.png` / `O-cart.png` / `O-faqs.png` | 原站 collections / cart / FAQ（1200 图） |
| `/tmp/shots-1216/*.png` | 本地 1216 视口全页截图（home/pdp/plp/collections/cart/faqs/search/login/policies/404，已预置 cookie 同意） |
| `/tmp/cmp/OC-top.png` / `OC-mid.png` | 原站 collections 卡片标题叠放位置目视证据 |
| `/tmp/cmp/RC-footer.png` / `LC-footer2.png` | 两侧页脚行结构对比 |

新增测量脚本：`runs.mjs`（非背景色行程检测）、`darkbox.mjs`（暗像素包围盒）、
`blines.mjs`（亮像素行带，用于深色页脚）、`pdp-chain.mjs`（PDP 布局链导出）、
`shot1216.mjs`（本地 1216 批量截图）、`thum-test.mjs`（多视口批量抓取）。
`/tmp/cmp/pdp-boxes.mjs`（PDP 元素盒模型）。

内容级取证（可读到原站真实 DOM 文本）：
`https://r.jina.ai/https://shop.x.com/pages/faqs`（10 组问答逐字）、
`.../collections`（4 个分类 + href）、
`.../collections/all`（22 件商品 + 2 件 Sold out + 无筛选/排序/分页）。

源码核对点（本轮新增）：`src/app/globals.css`（`.pdp-shell`、`.gallery-thumb-offset`）、
`src/components/shop/gallery.tsx`、`src/app/(shop)/products/[slug]/page.tsx`、
`src/app/(shop)/pages/faqs/page.tsx`、`src/components/shop/footer.tsx`。

源码核对点：`buy-panel.tsx`、`add-to-cart-button.tsx`、`search-sort-select.tsx`、
`search-sidebar-filters.tsx`、`footer.tsx`、`header.tsx`、`product-card.tsx`、
`quantity-input.tsx`、`prisma/xcom-catalog.ts`。

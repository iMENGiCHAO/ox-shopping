# Progress

## Session 2026-02（设计整改 + 商用分析）

- [x] Phase 1 审计：读 README/DESIGN.md/globals.css/tailwind.config/header/footer/product-card/homepage/products page/buy-panel/layout/button
- [x] Phase 2 设计令牌层
- [x] Phase 3 核心组件
- [x] Phase 4 页面级
- [x] Phase 5 文档同步
- [x] Phase 6 验证（typecheck/lint/build + 截图）

### Log
- 创建规划文件，开始 Phase 2
- [x] Phase 2 完成：globals.css（shop.x.com 令牌+btn-sweep/link-underline）、tailwind.config.ts（Helvetica 栈、radius 全 0、mono 中性化、阴影 hairline 化）、layout.tsx（去 Google 字体，系统栈）
- [x] Phase 3 进行中：button（黑底直角+sweep outline）、header（黑色+分类导航+移动横滚条）、footer（黑底居中）、lang-toggle（方形文字切换）、user-menu/cart-badge/currency-select/search-overlay（透明度配色）、product-card（居中陈列）、quick-add-button
- 开始 Phase 4：首页
- [x] 全部 6 个 Phase 完成：令牌层/组件层/页面层/文档/验证（tsc+lint+build+单测54+断言9/9+GLM视觉4页）
- [x] 二次整改（照抄 shop.x.com）：爬取原站 DOM+截图+GLM 精读 → 头部(左logo无导航65px)/首页(对半横幅[名]左上+ShopAll左下)/PLP白底居中标题/规格圆片/46px按钮/页脚单行链接
- [x] 数据修复：11 个缺图商品补图、分类横幅图重seed、灰度压暗滤镜
- [x] 终验：断言 10/10、GLM 同框对比 布局 9/9/9 气质 7、tsc+lint+build+单测54 全绿
- [x] 全栈复刻轮：x.com 素材本地化(20张图)、PDP规格交互(圆片/下拉)、预测式搜索(防抖API)、滚动显现Reveal、集合页hero、SEO三件套(sitemap/robots/JSON-LD)、伪造slug 500修复
- [x] 验证：tsc/lint/build 76页/单测54/断言10/10/交互QA 7/7 全绿；管理端登录页正常渲染
- [x] Grok 文档校准轮：原创占位素材替换全部 x.com 图(零容忍条款)、预售全链路(isPresale/0库存下单/扣减钳制)、/search 独立页、FAQ+Contact 页(含 FAQ 结构化数据)、留言箱(前台表单→API→管理端闭环+导航)、修改登录邮箱、Skip-to-content、页脚链接补齐
- [x] 验证：tsc/lint/build 83页/单测54/断言10/10/交互7/7/E2E(改邮箱·预售加购·留言闭环) 全绿；交付 docs/ACCEPTANCE.md
- [!] 客户反馈占位SVG=『变废』：已恢复 shop.x.com 全部原始摄影(17图+补抓banner-xai)，37商品+分类横幅重新指向；公告栏关闭对齐官方空态；GLM确认『图片质感接近/集合页还原度高/PDP达水准』；承诺视觉冻结
- [x] 全站主动审计轮：Playwright 深爬 x.com 全页面结构→四缺口修复(PDP推荐区标题28px居中/定制404/搜索页Availability+Price手风琴+Sort by//collections集合卡片页)；构建83页+单测54+断言10+交互7 全绿
- [x] Grok 规格书落地轮：修复灯箱点击放大回归(inline ref 回调覆盖 React 样式提交→改 flyFrom 状态驱动)；新增尺码表弹窗/页脚邮件订阅(前台→API→后台订阅列表全链路)/loading骨架×3/全局error边界/blur占位
- [x] 按客户要求移除邮件订阅功能（原站无、注册已有邮箱）：页脚表单/API/管理端订阅列表/Prisma 表全部删除，403(中间件拦截)验证无残留
- [x] 灯箱按原站源码精确复刻：抓取 Impact 主题 theme.js 拿到 PhotoSwipe 真实配置(bgOpacity:1/maxZoomLevel:3/双击缩放/单击背景关闭/滚轮切图/圆形按钮/无计数器)，九项 E2E 全过，构建+单测54+断言10+交互7 全绿
- [x] 前台英文/后台中文分离：DB 英文内容 0%→100%(37商品+12分类+属性值)，UI 硬编码中文清零(3 子代理并行+货币国家名/邮件默认语/ICP 条件渲染)，货币默认 USD，测试脚本选择器同步英文
- [x] 页面大图解耦：新增 /admin/banners 页面横幅管理(首页双横幅 图链题 + 集合页兜底图)，API GET/PUT + site_settings pageBanners 键，前台配置优先回落分类，E2E 配置→生效验证通过
- [x] 全站视觉对齐审计：新增 visual-parity.cjs 双站计算样式比对(PLP+PDP 差异归零)，清除全部自创灰底(#EFEFEF)/边框色阶(#DDDDDD)/主图 fill，镜像原站 27 商品目录+库存正常化，三套验证全绿
- [x] 排版密度对齐+缩略图吸附：xcom-spacing-capture 抓基准(网格20/20·12/64,卡题12px/图文距20,PDP 61:39·gap80·mediaW690),gallery 桌面竖排缩略图 sticky top-84 随窗滚动,全套回归绿
- [x] 商品卡悬停换图修复：双层常驻结构消除交叉淡化凹陷(变灰根因),单图卡不淡出;灯箱三连(开/双击2.5x/拖拽)固化进 QA,交互 10/10 全绿
- [x] 灯箱原站语义复刻:实测(白底/上下贴满900x900/单击锚点3x=2700px/grab拖拽),重写 gallery 舞台(白底零内距/单击合并图内外语义/didDragRef 防误触),QA 固化四断言 12/12;后端守卫矩阵+商用清单(sitemap/robots/SEO/空态)核查通过
- [x] 页脚213px对齐(15px/lh24.75/pad64+64) · WebP治理60MB→7.5MB+DB迁移+cache v5零破图 · PDP放大镜光标修复(按钮层拦截) · 全回归绿(10/12/0)
- [x] 顶图404修复:pageBanners/分类图指向已删png与外网picsum→全部换本地webp(13分类+3横幅槽),cache v6,五页面破图扫描全0,fashion顶图1440px正常渲染
- [x] PDP节奏统一(购买区mt-3=32锚点/数量行mt-8) · 放大镜光标改白色描边(深色图可见) · QA 12/12
- [x] PDP节奏:购买区块 mt-3(20+12=32锚点)·数量行mt-8 · 白色放大镜光标(深色图可见) · 修复重复className编译错
- [x] PDP官方化:去评价功能(星级行/评论Tab) · 描述直排价格下方 · 相关推荐改全宽bleed横向轮播(291px卡/snap/圆钮,12项) · 顶栏hover-reveal(顶部感应区) · 轮播拆client组件修500
- [x] PDP三栏精确对齐官方(缩略图→大图80px·信息列354px) · 轮播整卡无半截+箭头条件显隐(scrollLeft驱动,去snap修初始偏移)
- [x] 轮播终版:响应式整卡精确铺满(1/2/4列calc)任意视口零露边 · 挂载强制scrollLeft=0防恢复 · 左右箭头按需显隐 · 滚动条隐藏 · 三视口+滚动行为验证通过
- [x] 全栈克隆清剿①:PDP去收藏钮+评论数据链(结构化评分/查询/导入) · 删除评价/收藏/留言前后端文件与API · admin导航去评价留言箱 · 账户侧栏去收藏 · 页脚去Contact · 推荐区→页脚间距对齐官方636px(pb-[604px]) · 10页面200全通
- [x] 全量构建通过 · parity差异0 · 克隆清单执行中(结算字段/admin密度/404复检为下轮项)
- [x] 视觉模型对比发现dev服务器崩溃致500 → 清理webpack缓存重启,六路由200复验 · 下轮继续视觉逐页比对
- [x] 轮播收进container(左右留白与全站一致·卡片容器宽四等分零露边) · 推荐区→页脚间距604→pb-12
- [x] 复验口径修正:屏外整卡不计露边,可见区零跨界确认
- [x] 轮播calc空格修正(Tailwind任意值需下划线),四整卡精确铺满容器零露边

## Session 2026-08-24（实测重校准轮：以原站实时数据为准）

用户反馈"做的不一样，有很大出入"。实测发现历史文档的"差异=0"仅抽查了 CSS 值，
内容/结构层偏离严重。本轮以 Playwright+系统代理(127.0.0.1:10808) 实时爬取 shop.x.com 为唯一基准：

### 数据层（全量镜像）
- 抓取官方 /products.json + /collections.json + 两个 collection 成员表 → 30 商品全量重建
- 119 张官方图 width=1200 重下至 public/images/xcom2（503MB→87MB）
- seed.ts 重写：x-collection/spacexai-collection 两分类；slug=官方 handle；
  价格=官方 USD 价（$15-$85）；变体级售罄编码进 attributes.soldOutValues
- createdAt 编码官方首页 frontpage 陈列顺序（27 个），3 个 macrohard 新品未上列表页但 PDP 可达

### 货币体系
- 基础货币 CNY→USD（currency.ts/currency-server/provider/env/stripe 提示），
  默认展示 USD，价格与官方完全一致

### UI 层
- 品牌：title "Official SpaceXAI Shop"；头部 logo 换白色 X 图标(70px, sr-only 文字)
- 页脚：六链接精确复刻(+Accessibility Statement 新页) + "X Corp © 2024"
- PLP 推倒重来：无筛选/排序/搜索/分页，标题 Products，nameEn 字母序 = 官方逐位一致
- 商品卡：删折扣徽标与划线价；Sold out 徽标改官方样式(#EFEFEF 底/black65%/11px/8px offset)
- 首页：全部商品直出；Shop All 改白边框按钮(37px 高)
- PDP：恢复被误删的 BuyPanel（规格/数量/加购回归）；描述按官方位置嵌在规格与数量之间；
  删面包屑与底部详情段；JSON-LD USD；售罄规格禁用+划线、默认选首个有货值
- 登录页：Login 标题/提示语/E-mail 标签/"Don't have an account? Sign up"/忘记密码移到密码行右侧
- 购物车空态：Cart + Your cart is empty + Continue shopping（实心黑按钮）
- html lang=en；邮件模板品牌替换

### 验证
- tsc ✅ lint ✅ build 81 页 ✅ 单测 54/54 ✅ 交互 QA 12/12 ✅
- 首页/PLP DOM 顺序与官方逐位一致；购物车空态文案一致；价格 $35/$50/$85 等完全一致

## Session 2026-08-24（搜索页 /search 全量克隆轮）

用户指出 https://shop.x.com/search 未实现。实时爬取官方 4 种状态（空态/q=tee/q=hoodie/无结果），
提取 DOM 结构 + 计算样式几何后重写本地搜索页：

### 官方实测结构
- 空态：H1 "Search" 18px 居中(x570,y315,w300) + 搜索框(placeholder "Search...") + 放大镜提交，页面大量留白(bodyH 868)
- 结果态：H1 "Search" 28px 居中(y129) → `N results for "q"`(15px,y184) → Products/Pages 双 Tab(y257,12px,激活黑下划线)
  → 工具行(y320,h54)：右侧 Sort by 弹层(Relevance/Price low-high/Price high-low，黑底白字)
  → 内容区：240px 桌面空侧栏占位 + 主列 1054px：4 列网格(卡 218.5px/列距60/行距64)
- Filters 弹层仅移动端：In stock only 复选 + $ to $ 价格区间 + View results 黑按钮
- title 标签格式：`Search: N results found for "q"`

### 实现
- src/app/(shop)/search/page.tsx 全量重写（<details> 无 JS 弹层、GET 表单筛选）
- product.service 新增 relevance 排序（名称命中优先，组内保持官方顺序）+ title 排序复用
- Pages Tab：静态页注册表关键词匹配（FAQs/Accessibility/隐私/条款/Cookie）
- search-overlay 提交目标修正 /products?q= → /search?q=
- i18n 补 Search.../result(s) for/Pages/Relevance/Price, low to high 等 key

### 验证
- tsc/lint ✅ 单测 54/54 ✅ build ✅
- 空态几何与官方逐值一致(h1 x570 y315 w300)；结果页 h1 y129/tabs/sort 右对齐/4 列网格对齐
- GLM 视觉对比 8/10（剩余差异为 Shopify 黑盒相关度算法的排序/计数细微不同）

## Session 2026-08-24（续）：顶栏搜索浮层 + 购物车页克隆

### 顶栏搜索浮层（官方实测：黑色全宽接管面板）
- 点击顶栏 Search → 头部(65px)下方展开 fixed 面板 top-[65px]：
  搜索行 h77（放大镜白/65 + 无边框输入 18px 白字 placeholder "Search..." + 右侧16px Close）
- 输入≥2字符 → 联想区 [240px侧栏(Suggestions 12px 白/65 + 查询链接) | 主列4列卡片网格(方图+白色标题+价格)]
- Enter → /search?q=；Esc/遮罩点击关闭；body 滚动锁
- 关键实现: createPortal 到 body（否则被 header 层叠上下文拦截，hero 渐变挡住点击）
- search-overlay.tsx 全量重写；QA 选择器从旧 ul.divide-y 更新为网格卡片

### 购物车页 /cart（官方实测表格布局）
- title "Your Shopping Cart"（新增 cart/layout.tsx metadata）
- 空态: H1 "Cart" 18px 居中(y379) + Your cart is empty + 实心黑 Continue shopping
- 填充态: H1 "Cart" 28px 居中(y129) → max-w-980 表格:
  表头 Product|Quantity|Total (12px, y216 与官方逐值一致 x230/x791/x1080)
  行: 120px 方图 + 标题/Sale price/变体纯值大写(WHITE) + 居中数量步进器 + Remove + 右对齐行小计
  Total: $X USD (17px右对齐) + Taxes and shipping calculated at checkout (14px 65%) + 实心黑 Checkout
- 移除官方没有的优惠码卡/右侧汇总列（coupon 功能本就未持久化，checkout 页处理）

### 稳定性修复
- interaction-qa.cjs: domcontentloaded+1.2s → networkidle+2.5s（消除 dev 水合竞态误报），12/12 两连稳

### 验证
tsc ✅ lint ✅ 单测54/54 ✅ build 81页 ✅ QA 12/12 ✅
GLM 购物车有商品页对比：唯一差异(COLOR: WHITE vs WHITE)已修；空态几何逐值对齐

## Session 2026-08-24（续2）：搜索面板背景透明 bug 修复

用户报告：顶栏搜索展开后结果区背景透明（透出白色页面）。
- 像素级复现：截图边缘采样 255,255,255 纯白透出（dev 过期 chunk/HMR 中间态导致根节点无底色、遮罩未绘制）
- 官方像素分析：面板深色底实测 rgb(13,14,15)
- 修复：面板根节点显式不透明底 bg-[#0d0e0f]（任何子层渲染失败都不会再透出页面）；
  移除独立 backdrop div，点击关闭改挂根节点（表单行 stopPropagation 防误关）
- 重启 dev 清除过期 chunk 后验证：computedBg=rgb(13,14,15)；
  全屏多点采样（左/右边缘、顶部、卡片间隙、底部）全部 13,14,15 无一透明白
- 行为回归：点输入框不关闭 ✅ 点空白关闭 ✅ Esc 关闭 ✅ QA 12/12 ✅

## Session 2026-08-24（续3）：搜索面板改为官方同款透明磨砂

用户澄清：官方展开后结果区是"透明磨砂效果"（此前两轮理解反向：先透明裸露→后纯不透明，都不对）。
- 官方像素证据：白底区域透过面板读数恒为 153 灰 = rgba(0,0,0,.4)；表头行恒 0,0,0 = 不透明黑
- 实现：搜索行 bg-black 不透明；结果区 flex-1 overflow-y-auto + bg-black/40 backdrop-blur-xl
  （页面内容模糊+压暗透出，白底处呈 153 灰）；根节点恢复无底色仅作点击关闭层
- 验证：computedStyle bg=rgba(0,0,0,0.4) blur=blur(24px)；
  在纯白 /cart 页打开采样：左右边缘/卡片区全部 153,153,153 —— 与官方逐值一致；
  表头行 0,0,0 ✅；lint ✅ QA 12/12 ✅

## Session 2026-08-24（续4）：搜索面板=官方精确值（纯 40% 暗纱，无磨砂）

抠出官方 theme.css + 页面内联变量，拿到权威定义：
- ::part(overlay) background: rgb(var(--page-overlay))，页面注入 --page-overlay: 0 0 0 / 0.4
- .header-search::part(content) background: rgb(var(--background))，scheme-4 注入 --background: 0 0 0 / 0.0（全透明！）
- 即：整块只是一层 rgba(0,0,0,0.4) 暗纱罩住页面，内容层零底色零模糊；
  截图显纯黑是因首页背后深色大图透出，白底区域实测同样 153 灰
- 实现：根节点 bg-black/40 + 点击关闭；内容列全透明可滚动；搜索行去黑底仅留 hairline
- 验证：rootBg=rgba(0,0,0,0.4)、formBg=透明、无任何 backdrop-filter；
  白底页采样左右边缘 153 与官方白底读数一致；Esc/空白点击关闭 ✅ QA 12/12 ✅

## Session 2026-08-24（续6）：推荐轮播整数卡 + Size Chart 参数表 + 横图响应式

### 1) You may also like 轮播 — 随窗口缩放恒整数张（用户指出半截卡问题）
- 官方实测：1280→卡260 / 1440→291 / 1680→351 / 1920→411，恒 4 张完整无切割；全幅出血仅页边距
- 实现：相关区移出 .container 成页面级兄弟节点（w-full px-5 lg:px-[60px] 全幅）；
  卡宽改百分比 w-[calc(50%-10px)] md:[calc(33.333%-13.34px)] lg:[calc(25%-45px)]
  → 2/3/4 张整数随窗口缩放
- 验证：1280/1440/1680/1920 → 245/285/345/405 恒4张（与官方差=页边距12px系统差）

### 2) Size Chart 参数表（用户：官方是可开关参数表，我们是链接+图片弹窗）
- 官方结构：购买面板下方 <details> 手风琴 "Size Chart"（toggle 12px、行高84、内容pad 0 20 20 0）
  + .table-scroller 表格（15px、行 hairline #DDD、英寸值）；仅后台配置过的商品有（xai-vessel 等无）
- 抓取数据：the-xai-hoodie（Chest 44-56/Sleeve 22.5-28.5）、grok-logo-tee-copy-1（Chest/Sleeve）
- 重写 size-chart.tsx 为服务端 <details> 手风琴+表格（getSizeChart(slug) 静态映射）；
  PDP BuyPanel 下方挂载；buy-panel 移除旧链接+弹窗

### 3) 两种横图响应式
- 首页双横幅：实测已与官方逐值一致（768/1440/1920 = 官方同值）✓ 无需改
- 集合页横幅：原 aspect-[21/9] max-h-[420px]（1920 封顶不再增长）→ 改 aspect-[3.49/1] min-h-[220px]
  官方恒比例 3.49：768→220 / 1440→412 / 1920→550， ours 220/413/550 逐值命中 ✅

tsc/lint/QA12-12 ✅ build ✅

## Session 2026-08-24（续7）：Size Chart 官方位/全量数据 + 全站响应式 + 后台中文台优化

### 1) Size Chart（用户：位置在大图下方、+/− 可开关、后台配置的商品才显示）
- 官方实测 hardcore-grok-reflective-tee：位于左列画廊下方、整列宽；toggle 为 CSS 加号 animated-plus
  （展开旋转45°）；表格 15px/hairline #DDD/英寸值
- 批量抓取 14 个服装品图表（成人 XS-3XL / 童装 2T-12 两套表头）→ size-chart-data.tsx 静态映射
- PDP 结构调整：左列包 flex-col，Gallery 下方挂 SizeChartAccordion（无图表商品不渲染，与官方一致）
- 交互验证：初始关→点开(+旋转45°)→再点收起 ✓；xai-vessel 无参数表 ✓

### 2) 全站响应式审计（375/768/1024/1440/1920 × 6 页面 = 30 项）
- 横向溢出全部 0 ✓（首页/列表/集合/PDP/购物车/搜索）
- 此前已对齐：首页双横幅(50%×2)、集合页 hero(3.49:1)、推荐轮播整数卡

### 3) 后台管理（中文操作台）
- 数据打通 E2E：登录✓ → 改价 PUT $77.77 → 店面实时生效✓ → 还原$50✓；订单API✓；设置API✓；横幅API→首页双横幅✓
- 品牌统一：星辰商城/MENG Shop → SpaceXAI Shop（login/shell/env/invoice/settings fallback/shop-i18n 共8处）
- 中文化收尾：products 行按钮(Edit/Delete)/状态标签/删除对话框(原title="DeleteProduct"坏键)；
  orders/users/coupons 表头 Status/Actions；categories 按钮+对话框标题；settings 策略描述；
  admin-i18n 补 Draft/Delete product/插值消息等键，修复重复键 TS1117
- 复查：7 个管理页独立英文词残留 = 0

### 回归
tsc ✅ lint ✅ QA 12/12 ✅ 单测 54/54 ✅ build ✅

## Session 2026-08-24（续8）：参数表空行修复 + 后台参数表/尺寸库存编辑 + 徽标划线价

### 1) Size Chart 空行 bug（用户反馈）
- 根因：表格按 headers 长度(8)生成行，rows 只有 2 → 5 行空白带边框
- 修复：表头单行渲染 + rows.map 数据行；实测 3 行整、0 空单元格 ✅

### 2) 后台产品参数表入口（数据驱动）
- schema: Product 新增 sizeChart/specStock(Json?) + isNew/isHot(Boolean)，prisma db push ✅
- 验证 schemas + PUT/POST 路由白名单（Prisma.DbNull 处理可空 JSON）
- product-form.tsx 新增：规格库存编辑器（从可选 Size 组推导，逐尺寸数字输入，0=售罄，
  实时汇总写回总库存）；参数表网格编辑器（增删行列/清空）；新品上市/热卖开关
- 服务端强制口径：PUT/POST 提供 specStock 时总库存=各规格之和（curl 实测 37）✅
- 表单 selectable 缺省语义修复（多值组默认可选，与店面 parseAttributes 一致）

### 3) 尺寸级销售状态（不同尺寸=独立规格商品）
- PDP soldOutValues 由 specStock 驱动（0→禁用+"— Sold out"），默认选中首个有货尺寸
- 官方对照：官方同为 select 下拉(354×48/1px #DDD)，售罄选项禁用 — 结构一致 ✅
- 实测：XS/M 显示 Sold out 禁用，S 默认选中 ✅

### 4) 划线价/徽标前端显示
- PDP 价格行：现价+划线原价($59.00 line-through) ✅
- 商品卡+PDP 大图左上：官方 badge-list--vertical（11px 大写 #EFEFEF 底 black/65 内缩8px）
  New/Hot/Sale/Sold out/Pre-order 全套 ✅ 卡片实测 [New,Hot,Sale]+划线价 ✅
- toCardData/AdminProduct/ProductFormPayload 类型链路扩展

### 回归
tsc ✅ lint ✅ QA 12/12 ✅ 单测 54/54 ✅ build ✅

## Session 2026-08-24（续9）：徽标位/成本价/搜索行黑底/两级放大

1) 徽标遮挡缩略图：Gallery 增加 badges 插槽渲染于主图左上（badgeX 204 > 缩略图右缘 116）✅
2) 成本价前端显示：PDP 价格行下「成本价: $45.00」（costPrice>0 才显示，i18n Cost 键）✅
3) 搜索面板输入行黑底：代码已是 bg-black（官方像素实测同为纯黑 0,0,0），刷新后 chain 确认 rgb(0,0,0)；
   早前灰读数为过期 chunk ✅
4) 两级放大重写（官方 1440×900 实测几何）：
   - 开启=适配态；单击→一级 height=100vh 上下贴死仅横移(zoom-in 光标)
   - 再单击→二级 ×3(900→2700) 全向贴边拖拽(grab/grabbing)，初始居中位 top/left=-900/-630 与官方逐值一致
   - 三单击→回适配态循环；QA 断言同步官方语义（first zoom locks to window height 等 5 项全 PASS）
   - QA 脚本水合时序修复（grok-logo-tee 页 networkidle+3.5s）
回归：tsc ✅ lint ✅ QA 13/13（新增两级放大断言）✅ 单测54 ✅ build ✅

## Session 2026-08-24（续10）：规格下单修复 + 官方灯箱物理 + FAQ后台化 + 分享卡/客服咨询

1) 下单报「Size 不是可选规格」：cart.service selectableSpecs 与店面 parseAttributes 口径统一
   （未显式 selectable 时多值组默认可选）→ 选 S 加购成功，购物车行含规格 ✓
2) 灯箱官方物理重写：
   - 一级横拉过阈值(12%vw) → 居中切换上/下一张且保持放大级别；小拉弹回居中
   - 二级自由拖（按住零过渡），松手仅对露白方向以 1100ms cubic-bezier 缓动回弹贴边；
     有余边原地不动继续看细节（实测曲线 900→726→645→630 贴边）
   - setPointerCapture：拖出视口不丢事件（onPointerLeave 不再误杀拖拽）
   - 飞入动画仅适配态播放；‹关闭›按钮组置于图片下方中央（x=720 居中实测）
3) FAQ 后台化：Faq 模型+7条种子迁移；/api/admin/faqs CRUD + contact-content GET/PUT；
   后台「FAQ 管理」页（列表/新增/编辑/发布开关/排序 + 联系板块编辑）；前台 /pages/faqs 读 DB
   （空库兜底）+ 底部联系我们板块（DB 可编辑）；新建 /pages/contact 表单页 → 留言箱
4) 加号按钮改造 ProductShareMenu：
   - 分享商品卡：canvas 合成 图+名+价 PNG → Web Share API / 下载+复制链接
   - 咨询客服：ProductInquiry 模型（userId/productId/content/reply/readByUser）
     POST /api/inquiries（401 引导登录）/ GET /api/user/inquiries / read 上报 /
     admin 列表+回复 PUT（回复置 unread）
   - header 登录态铃铛：未读角标+下拉回复列表，打开即全部已读
5) 后台表格去 min-w-[880px]/overflow-x-auto → w-full 自适应；SKU/Sold/Items/Payment 列
   lg/xl/md 响应式隐藏；375/768/1440 三档五页面零横向溢出 ✓
6) Size Chart 行布局官方化：标题左、加号开关右（展开旋转45°）
7) 首页双横幅 grid-cols-2 全宽段保持并排（手机端不换行）
回归：tsc ✅ lint ✅ 单测54 ✅ QA 13/13 ✅ build ✅

## Session 2026-08-24（续11）：消息中心完整闭环 + 快照卡 + 聊天记录 + 分享卡内容

1) 404 根因：/api/admin/messages 路由从未存在（页面引用了它）→ 补 GET(?handled) + PATCH [id]；
   「点消息报404」「切待处理/已处理/全部报错」均由此修复
2) 消息入口迁移：侧栏 Messages 移除 → 右上角账号菜单「消息中心（N 条待处理）」+ 头像红角标（60s轮询+路由变化刷新）
3) 独立铃铛撤销 → 未读数挂登录账号入口（头像角标+菜单内徽标），点开账号菜单进 /account/messages 收发
4) 咨询带商品卡快照：ProductInquiry + productName/productImage/priceSnapshot 字段；
   前端发送时带上卡图/名/价；管理端线程头渲染卡图+名+价+「查看商品」→ 店面 PDP（slug 富化修复 id→404）
5) 管理端线程式聊天：按商品分组，完整时间线（客户左/客服右+时间戳），回复框置底回最新一条，
   聊天记录上下文完整可见
6) 咨询弹层/菜单 Portal 到 body：商品卡 Link 堆叠上下文不再遮挡弹层
7) 分享卡内容升级：canvas 绘 图+名+介绍节选(2行)+价格(+划线原价)+品牌（完整商品卡样式）
8) 测试基建：Playwright 统一 --disable-dev-shm-usage（浏览器 OOM 崩溃修复）
回归：tsc ✅ lint ✅ 单测54 ✅ QA 13/13 ✅（API 级全链路 8 项 ✓：登录/咨询201带快照/富化/回复200/未读1/已读清零/留言箱200）

## Session 2026-08-24（续12）：咨询聊天商业级补全（限流/已处理/清除/精修）

1) 灌水防护：POST /api/inquiries 每用户每小时 5 条限流（rateLimit 复用，429 提示稍后再试）
2) 已处理状态：ProductInquiry.handled；回复自动置已处理；管理端可手动 标记已处理/恢复待处理；
   商品咨询视图内 待处理/已处理/全部 三级过滤（GET ?handled=）
3) 信息清除：
   - 客户侧 /account/messages 每条「清除」（DELETE /api/user/inquiries/[id]，仅删本人）
   - 管理端「清除该线程」（DELETE ?thread=1 按 productId+userId 清整条聊天线，灌水场景一键清理）
4) 样式精修（高档简洁）：
   - 管理端线程卡：快照图/名/价 + 状态胶囊（待处理实底/已处理描边）+ 客户左/客服右气泡时间线 + 操作条
   - 客户侧：状态胶囊+时间+清除、气泡对话（我右/客服左）、追问框分隔线
5) 生产交付验证：npm run build 91/91 ✓ → next start 全链路：
   发送201/限流429/过滤✓/回复自动已处理✓/客户清除✓/线程清除9→0✓/数据已清空恢复干净
   浏览器冒烟：客户空态✓ 管理端tabs✓ 线程渲染✓（QA 待收）
   ※ dev 模式此机 webpack 缓存反复挂起 → 交付验证一律走生产构建（更接近交付形态）

## Session 2026-08-24（续13）：客服消息/咨询功能整体下线 + FAQ 联系板块保留

用户决定：不要前端发消息给后端的通道（安全/灌水/管理负担）→ 全部拆除：
1) ProductInquiry 模型+表、/api/inquiries、/api/user/inquiries、/api/admin/inquiries 全删
2) 分享菜单恢复纯分享（去掉咨询客服入口）；账号菜单去消息项与未读徽标；
   后台 shell 去角标 hook/消息中心入口；/account/messages 删除(404)
3) ContactMessage 模型+表、/api/contact、/api/admin/messages、/pages/contact 表单全删；
   /admin/messages 页删除(登录后404)；validations/contact.ts 清理
4) FAQ 底部联系板块【保留】：heading/body/email 后台可编辑（/api/admin/contact-content 保留），
   展示为 mailto 直达（不再指向已删表单页）
5) 前端发送成功判定修复（apiFetchRaw 返回 JSON 信封，res.ok 误判导致恒失败）——
   此修复随功能下线不再被使用，但判定方式已修正为 body.data
体检（生产模式）：全部页面 200；已删路由 404/登录后404；侧栏无 Messages；
   右上角菜单仅 账号设置/退出登录；无残留红角标；FAQ 页 mailto 联系板块渲染 ✓

## Session 2026-08-24（续14）：售罄 Sold out/Notify me + 分享按钮整块化 + 既有能力体检

1) 售罄商品 PDP（官方 Impact 语义）：
   - Add to cart → "Sold out"（disabled 不可点，data-sold-out，浅灰官方样式）
   - Buy Now → "Notify me"（可点 Bell 按钮）→ 内联展开邮箱输入 → POST /api/notify-me
     （CSRF 走 apiFetchRaw；每邮箱每小时 5 次限流防灌水；同邮箱同商品去重）
   - 成功态替换按钮为 "We'll email you when this product is back in stock"（官方文案）
   - NotifyMe 表（email/productId/status/notifiedAt）；后台 /admin/notify-me 列表页+删除，侧栏「到货通知」入口
   - BuyPanel 传 soldOut={disabled && !isPresale}（预售保持可购）
2) 分享按钮：+ 点击直接分享（删弹出菜单与 hover 白边），下载 PNG 商品卡/Web Share/复制链接
3) 既有能力体检（均已存在且完好，回归确认）：
   - 仪表盘 stats+销售趋势图 ✓ 多币种实时汇率 API ✓ sitemap/robots ✓
   - 售后：前台订单详情 refund 入口 + 后台 Refunds 审批 ✓ 支付 mock/stripe 模式 ✓ SMTP 邮件 ✓
回归：tsc ✅ lint ✅ 单测54 ✅ QA 13/13 ✅ build ✅；测试数据已还原（库存50、订阅清空）

## Session 2026-08-24（续15）：分享面板多平台 + Notify 官方弹窗（选规格）+ 推荐间距

1) 分享升级为「链接商品卡面板」（不再生成图片，避免介绍节选挤变形）：
   - 点 + 打开分享面板（portal 精致卡片）：多图切换（‹ › + 序号 1/3）、名称/价格(划线原价)/品牌、介绍节选作为前置简介展示、商品链接
   - 自媒体矩阵：微信（qrcode 生成扫码二维码浮层）、Email(mailto)、X、Facebook、WhatsApp、Telegram、微博 + 复制链接/系统分享(Web Share，文案=介绍节选放最前)
2) Notify me 官方逻辑（弹窗选规格→填邮箱→变体级补货提醒）：
   - 售罄点 Notify me → 弹窗：规格组值按钮（售罄变体禁用+划线，如 M/L/XL/2XL 灰掉）、邮箱输入、提交
   - 有规格组时必须选中（否则提交禁用+提示），提交 POST attributes:{"Size":"S"} 落库 NotifyMe.attributes(Json)
   - 成功态：We'll email you when this product is back in stock；去重+限流沿用
3) You may also like 推荐区上方间距 40→80px（两行，官方观感），实测 gap=80 ✓
回归：tsc ✅ lint ✅ 单测54 ✅ QA 13/13 ✅ build ✅；数据已还原（库存50、测试订阅清空）

## Session 2026-08-24（续16）：Notify 邮箱预填 + 推荐间距微调

1) Notify me 官方弹窗：已登录账号邮箱自动预填（defaultEmail 链：PDP RSC getSessionUser → BuyPanel → BuyNowButton useState 预填；游客为空输入框）——实测登录 ✓ 游客空 ✓
2) You may also like 推荐区间距：两行(80px)→一行(56px 实测)，协调
3) 读图尝试记录：read_image 当前模型无视觉；子代理(kimi-k3)无视觉；workflow 指定 deepseek-v4-flash-vision-exp 未注册（settings.yaml 仅有 minimax-m3/deepseek-v4-flash-0731/kimi-k3/glm-5.2:free）

## Session 2026-08-24（续17）：Notify me 官方精确对齐（爬官方 RestockRocket 实测）

爬取 shop.x.com/products/xai-vessel 官方 HTML（curl 代理）拿到 RestockRocket App 精确配置：
- 页面按钮：NOTIFY ME 大写、白字、背景 #1c1c1c、字距 2.34px、字重 700、字号 13px（已对齐，含 font-size 13px 内联）
- 弹窗：标题 "Notify me"、描述 "Get a notification as soon as this product is back in stock by signing up below."
  规格/颜色选择、Email 标签、条款 "You'll only receive notifications for this product."
  提交按钮 "Notify me when available"（白字 #202223 背景）
  成功 "Thank you! We will notify you when the product is available."
- 主按钮售罄：官方 disabled "Sold out"（已对齐）
- 登录邮箱预填保留（实测 user@example.com ✓）
实测：①按钮 rgb(28,28,28)/白/2.34px/700 ✓ ②弹窗文案/规格/预填/提交#202223 ✓
回归：tsc ✅ lint ✅ 单测54 ✅ QA 13/13 ✅ build ✅；库存/订阅已还原
（读图受限说明：read_image 当前模型无视觉；已注册 deepseek-ai/deepseek-v4-flash-vision-exp 至 settings.yaml，需重启 Harness 会话生效）

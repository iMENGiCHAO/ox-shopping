# 会话总结：shop.x.com 精确克隆项目（完整会话工作记忆）

> 本文档是"shop.x.com 精确克隆"项目的**工作记忆**：每次会话做的改动、官方实测数值、
> 已下线功能、环境坑位与下一步方向。下次接手优化前**务必先读本文档**，
> 避免重复实现已被移除的功能或踩同样的坑。
> 覆盖范围：**2026-02 设计整改 → 2026-08-24 全部 17+ 轮**（完整会话历史）。
> 逐轮明细见根目录 `progress.md`（19 个 Session 日志）；本文件是提炼版速查。

---

## 0. 项目全景（早期会话浓缩，2026-02 → 续8）

### 0.1 设计整改轮（2026-02）
- 六阶段整改：审计 → 设计令牌层（globals.css 官方令牌、tailwind radius 全 0、Helvetica 栈）→
  核心组件（黑底直角按钮 sweep、黑色头部/页脚、搜索浮层、商品卡）→ 页面层 → 文档 → 验证（单测54/断言9-10/GLM 视觉）
- 照抄 shop.x.com：爬原站 DOM+截图+GLM 精读；素材本地化（x.com 图→本地 20 图→后恢复官方摄影 17+ 图，客户反馈占位 SVG"变废"）
- 全栈复刻：PDP 规格交互、预测式搜索、滚动 Reveal、集合页 hero、SEO 三件套（sitemap/robots/JSON-LD）、伪造 slug 500 修复
- 移除过功能：邮件订阅（页脚，客户要求移除）、评价/收藏/留言（清剿轮：删文件+API+导航+数据链）

### 0.2 灯箱（PhotoSwipe 语义，比 §2.1 更早的基准）
- 抓 Impact 主题 theme.js 拿真实配置：bgOpacity:1 / maxZoomLevel:3 / 双击缩放 / 单击背景关闭 / 滚轮切图 / 圆形按钮 / 无计数器
- 后按实测重写：白底零内距、单击锚点 3x=2700px、grab 拖拽、didDragRef 防误触（见 §2.1 现行物理）

### 0.3 实测重校准轮（2026-08-24 主轮）——**数据/货币/UI 全面对齐官方**
- 用户："做的不一样，有很大出入" → 以 Playwright+系统代理(127.0.0.1:10808) 实时爬官方为**唯一基准**
- 数据：官方 /products.json + /collections.json → 30 商品全量重建、119 张官方图（503MB→87MB）、
  slug=官方 handle、价格=官方 USD、变体级售罄编码进 attributes.soldOutValues、createdAt 编码官方首页陈列顺序
- 货币：基础货币 CNY→USD（默认 USD，与官方完全一致）
- UI：品牌 "Official SpaceXAI Shop"、白色 X logo、页脚六链接+"X Corp © 2024"、
  PLP 无筛选/排序/分页（nameEn 字母序=官方逐位一致）、商品卡删折扣徽标、
  Sold out 徽标官方样式（#EFEFEF 底/black65%/11px）、PDP 描述嵌规格与数量之间、登录页文案对齐
- 验证基线：build 81 页 / 单测 54 / 交互 QA 12

### 0.4 搜索/购物车/推荐/参数表（续0～续8）
- /search 页：官方 4 种状态（空态/q=tee/q=hoodie/无结果）克隆
- 顶栏搜索浮层：官方实测——搜索行 h77 纯黑不透明、结果区 `rgba(0,0,0,.4)` 暗纱（**无磨砂**，
  官方 theme.css：--page-overlay: 0 0 0 / 0.4；连续 4 轮才对齐，详见 progress 续1~续4）
- 购物车页：空态 "Cart + Your cart is empty + Continue shopping"（实心黑按钮）
- 推荐轮播：随窗口恒整数张（1280→260 / 1440→291 / 1680→351 / 1920→411 恒 4 张），
  全幅出血仅页边距、左右箭头按需显隐、scrollLeft 驱动
- Size Chart：位于左列画廊下方、整列宽、animated-plus 开关（后台配置才显示、全量数据、空行修复）
- 后台中文操作台、页面横幅管理（/admin/banners）、visual-parity.cjs 双站计算样式比对（PLP+PDP 差异归零）
- WebP 治理 60MB→7.5MB、顶图 404 修复、前台英文/后台中文分离（I18N_MIGRATION.md）

---

## 1. 本阶段改动总览（续9～续17，按时间）

| 编号 | 改动 | 状态 |
|---|---|---|
| 续9 | 徽标（New/Hot/Sale/Sold out/Pre-order）渲染到**主图左上角**而非缩略图；成本价后台填了才显示；搜索输入行背景确认纯黑；灯箱**两级放大**（官方 1440×900 实测几何） | 保留 |
| 续10 | 规格下单报"不是可选规格"修复（`cart.service.selectableSpecs` 与店面 `parseAttributes` 口径统一：未显式 selectable 的多值组默认可选）；灯箱弹性拖拽物理；FAQ 后台化；加号分享/咨询系统 | 规格修复/灯箱/FAQ **保留**；咨询系统**已下线** |
| 续11 | 消息中心完整闭环：客服咨询 + 账号铃铛 + 后台回复 | **已下线**（见 §3） |
| 续12 | 咨询聊天商业级补全（限流/已处理/清除/线程） | **已下线** |
| 续13 | **消息/咨询功能整体删除**（用户决定：担心灌水与后台负担）；FAQ 底部联系板块保留（仅展示 + mailto，无表单） | 保留 |
| 续14 | 售罄商品交互（官方 Impact/RestockRocket）：Add to cart → "Sold out" 禁用；Buy Now → "Notify me"；分享按钮整块化（去掉弹出菜单白边） | 保留 |
| 续15 | 分享面板升级：**链接商品卡**（多图切换 + 介绍前置文案 + 自媒体矩阵：微信二维码/邮件/X/FB/WhatsApp/Telegram/微博）；Notify me 弹窗选规格→填邮箱→变体级落库 | 保留 |
| 续16 | Notify 弹窗**登录邮箱自动预填**（PDP RSC → BuyPanel → BuyNowButton）；"You may also like" 间距两行→一行（80px→56px） | 保留 |
| 续17 | **Notify me 官方精确对齐**（爬官方 HTML 拿 RestockRocket 配置逐值复刻） | 保留 |

---

## 2. 官方实测规格速查表（改 UI 前先查这里）

### 2.1 灯箱放大（官方 1440×900 实测）
- 开启 = 适配态（contain）；单击 → 一级：高 = 100vh（900×900）、上下贴死、**仅横向可拖**、光标 zoom-in；
- 再单击 → 二级：×3（900→2700×2700）、初始居中 `top:-900 left:-630`、光标 grab、四向自由拖；
- **拖拽物理（用户多次强调）**：
  - 一级：横向拉过阈值（`max(80, 12%vw)`）→ 居中切换上/下一张**且保持一级**；小拉弹回居中；
  - 二级：按住期间**自由跟随不钳制**；松手只对"露出空白"的方向以 **1100ms cubic-bezier(0.16,0.84,0.44,1)** 缓慢回弹贴边；**有余边则原地不动**（继续看细节）；
  - 必须 `setPointerCapture`（拖出视口不丢事件）；`onPointerLeave` 只在非拖拽时清状态；
  - 飞入动画仅在适配态播放（一级内切图不重放）；
- 底部中央按钮组：‹ 关闭 ›（Previous/Close/Next），`absolute bottom-6 left-1/2`；
- 点击语义：空白处任意级关闭；图上 0→1→2；二级点图关闭。
- QA 断言语义见 `scripts/interaction-qa.cjs`（两级：first zoom locks to window height / second zoom ~3x / drag pans）。

### 2.2 售罄 / Notify me（官方 RestockRocket App 实测配置）
- 主按钮售罄：`<button disabled>Sold out</button>`（禁用、置灰）；
- **NOTIFY ME 按钮**（官方 css_config 原文）：
  - 文案大写 NOTIFY ME；背景 `#1c1c1c`；文字 `#FFFFFF`；`letter-spacing: 2.34px`；`font-weight: 700`；`font-size: 13px`；高 ~43.85px；
- **弹窗**（官方 cachedSettings 原文文案）：
  - 标题 `Notify me`；描述 `Get a notification as soon as this product is back in stock by signing up below.`
  - 规格/颜色选择（**必选**，售罄变体禁用+划线）——官方要知道客户关注哪个变体；
  - Email 标签；条款 `You'll only receive notifications for this product.`
  - 提交按钮 `Notify me when available`（白字、背景 `#202223`）；
  - 成功 `Thank you! We will notify you when the product is available.`
  - 错误 `Please enter a valid email address`
- **登录邮箱自动预填**：PDP RSC `getSessionUser()` → `BuyPanel defaultEmail` → `BuyNowButton useState(defaultEmail ?? "")`；
- 数据：`NotifyMe` 表（email/productId/**attributes Json**（选中的变体）/status/notifiedAt）；
  `POST /api/notify-me`（CSRF + 每邮箱每小时 5 次限流 + 同邮箱同商品去重）；
  后台 `/admin/notify-me` 列表页（侧栏"到货通知"）。

### 2.3 徽标（商品卡 + PDP）
- 11px uppercase、`#EFEFEF` 底、`black/65` 字；PDP 徽标渲染在**主图左上角**（`absolute left-2 top-2 z-10`，badgeX=204 > 缩略图右缘 116），不遮缩略图。

### 2.4 搜索面板
- 输入行：`bg-black`（像素级 rgb(0,0,0) 与官方一致）、h-77、pad `24px 0`、输入框透明、无 border-b。

### 2.5 Size Chart / FAQ / 其他
- 参数表行：标题**左**、animated-plus 开关**右**（展开旋转 45°）；
- FAQ 由后台"FAQ 管理"维护（DB 表 `faqs`），前台 `/pages/faqs` 读取；空库有兜底；
- 首页双横幅：`grid-cols-2`（手机端也并排不换行）；
- "You may also like"：上方间距 **56px（一行）**；
- 后台表格：无 `min-w`/`overflow-x-auto`，`w-full` 自适应，次要列响应式隐藏（375/768/1440 三档零溢出）。

---

## 3. 已下线功能（不要再做）

- **商品咨询（卡片 + 号 → 咨询客服）**：ProductInquiry 模型/表、`/api/inquiries`、`/api/user/inquiries`、`/api/admin/inquiries` 全部删除；
- **客户消息中心** `/account/messages`、账号未读角标、铃铛组件 —— 删除；
- **联系我们表单与留言箱**：`ContactMessage` 模型/表、`/api/contact`、`/api/admin/messages`、`/pages/contact`、后台"留言箱"页 —— 全部删除；
- **保留**：FAQ 底部联系板块（heading/body/email，后台 FAQ 管理页内编辑，前台 mailto 直达，无表单）；
- 用户理由：前端发消息到后台有灌水/安全风险，后台管理负担大。

## 4. 分享面板（当前形态，别回退成图片卡）

- 点卡片「+」→ **分享面板**（portal 到 body，精致圆角卡片，无 hover 白边）：
  - 多图切换（‹ › + 序号 1/N）；
  - 链接商品卡：名 + 价（划线原价）+ 品牌 + 商品链接；**介绍节选作为前置简介**（同时作为分享文案开头）；
  - 平台矩阵：微信（qrcode 生成二维码浮层）、Email(mailto)、X、Facebook、WhatsApp、Telegram、微博 + 复制链接 + 系统分享（Web Share）；
- 注意：**不要**再回到 canvas 生成 PNG 图片卡（介绍节选会挤变形，用户明确否决）。

---

## 5. 技术要点与坑位（血泪经验）

1. **CSRF**：所有变更请求（POST/PUT/PATCH/DELETE）必须带 `X-CSRF-Token`（cookie `csrf_token`）。前端一律用 `apiFetch/apiFetchRaw`（自动处理）；**不要**手写 `fetch` 发变更请求。
2. **apiFetchRaw 返回解析后的 JSON 信封**（`{data:...}`），**不是 Response**！判断成功用 `body?.data?.id` 之类，别用 `res.ok`（恒 false）。错误信息在 `ApiClientError.message`（含服务端 429/401 文案）。
3. **限流**：`src/lib/rate-limit.ts`（Redis/内存双模式）；`rateLimited()` 抛 429。已用于：登录、咨询(已下线)、notify-me(5/小时)。
4. **dev 模式 webpack 缓存**：本机（Time Machine 卷）dev 反复挂起/ENOENT。**验证一律走生产**：`rm -rf .next && npm run build && npm start`。改代码后如果 dev 卡在 "Compiling / ..." 别等，直接生产构建。
5. **Playwright 浏览器在本环境易崩**：`launch({ args: ["--disable-dev-shm-usage"] })` 必须；页面加载后 `waitForTimeout` 多等（水合慢）；多 context 场景易 OOM——必要时用 **API 级 E2E**（node fetch + 手动 cookie jar + CSRF）替代浏览器。
6. **端口**：多个旧 `npm start/dev` 进程会占 3001 等端口；起服务前 `lsof -tiTCP:3000 | xargs kill`，并检查 3000 真的在监听。
7. **Prisma 删表**：`prisma db push --accept-data-loss`（会丢数据，按需）。
8. **模型无视觉**：当前会话主模型不支持 `read_image`；`deepseek-ai/deepseek-v4-flash-vision-exp` 已注册进 `~/.dsh/settings.yaml`（需重启 Harness 会话生效）。复刻官方细节时优先**爬官方 DOM**（curl -x http://127.0.0.1:10808 代理）而非看图。

## 6. 验证方法（交付标准）

```bash
npm run typecheck          # 0 error
npx next lint              # 0 warning
npm test                   # 54/54
node scripts/interaction-qa.cjs   # 13/13（含灯箱两级/售罄/搜索/购物车等，生产模式跑）
npm run build              # 91/91 静态页
npm start                  # 生产服务，关键页 200
```
- 数据库敏感测试后要**还原**（如 grok-logo-tee 库存 50、清 notify 测试数据）。

## 7. 下一步优化方向（待办）

- 重启 Harness 会话后，用视觉模型复核两张参考图（`/tmp/notify-ref.png`、`/tmp/soldout-ref.png`，原文件在 `~/.dsh/attachments/v1/objects/`）的剩余细节；
- 后台仪表盘/多币种/邮件/支付/售后/sitemap 均已实现且验证（体检过），无需重做；
- 潜在项：支付真实网关密钥接入（Stripe/微信/支付宝）、SMTP 真实发信、NotifyMe 补货后"一键通知"（将 status=draft 改为 notified 并群发邮件）、收藏/搜索体验按官方继续微调。

## 8. 文档地图（按需查阅）

| 文档 | 内容 |
|---|---|
| `progress.md`（根目录） | **逐轮会话日志**（19 个 Session，最详细） |
| `docs/SESSION_SUMMARY.md`（本文件） | 提炼版速查：全景 + 官方数值 + 已下线功能 + 坑位 |
| `docs/DESIGN.md` | 前端设计规范（shop.x.com 黑白极简、0 圆角、令牌） |
| `docs/ACCEPTANCE.md` | 验收标准（可交付判定） |
| `docs/I18N_MIGRATION.md` | 前台英文/后台中文分离方案 |
| `docs/COMMERCIAL_READINESS.md` | 商用就绪清单（P0 守卫项） |
| `docs/PRODUCTION_CHECKLIST.md` | 生产上线检查清单 |
| `docs/AGENT_CONVENTIONS.md` | AI 智能体接入设计/操作约定 |
| `docs/CLONE-BACKLOG.md` | 克隆遗留清单 |

## 9. 相关文件索引

- 灯箱：`src/components/shop/gallery.tsx`（stage 状态机 0/1/2 + 弹性物理 + portal 按钮组）
- 购买区：`src/components/shop/buy-panel.tsx`、`buy-now-button.tsx`（Notify 弹窗）、`add-to-cart-button.tsx`（Sold out）
- 分享：`src/components/shop/product-share-menu.tsx`
- 售罄数据：`prisma/schema.prisma`（NotifyMe）、`src/app/api/notify-me/route.ts`、`src/app/admin/notify-me/page.tsx`
- FAQ：`src/app/(shop)/pages/faqs/page.tsx`、`src/app/admin/faqs/page.tsx`、`src/app/api/admin/faqs/`、`contact-content/`
- 官方测量：本文件 §2；QA：`scripts/interaction-qa.cjs`

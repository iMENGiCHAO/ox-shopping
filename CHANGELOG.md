# CHANGELOG

记录面向商业化交付的系统性修复与改进。每一项均经过代码层面的修改并可直接验证。

> **接手必读**：
> - 整体开发文档：[docs/PROJECT_DEVELOPMENT.md](docs/PROJECT_DEVELOPMENT.md)
> - 速查手册：[docs/QUICKSTART_2026-09.md](docs/QUICKSTART_2026-09.md)（10 分钟上手）
> - 部署上线：[docs/PRODUCTION_DEPLOY_2026.md](docs/PRODUCTION_DEPLOY_2026.md)
> - 上线清单：[docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md)
> - 历史会话/审计文档已归档清理（以当前文档为最终基准）。

## 2026-10-09（四）晚 · 集合内页透明顶栏对齐原站改版 + seed 覆盖事件复盘

> 大爷反馈「分类内页顶栏到顶要透明、悬停/搜索恢复黑」+「横图没了」。
> 复核发现**原站 9 月底已改版**（SpaceXAI 主题）：9-20 的旧实测（横幅不钻顶栏）作废。
> 验证：typecheck 0 错 / 该文件 ESLint 0 问题 / 单测 **323/323**。

### 集合内页透明顶栏（collection-listing.tsx）
- 原站现行机制（借代理直读 DOM + theme.css）：hero 声明 `[allow-transparent-header]`
  → 顶栏顶部时透明（--background 归零、负 margin 让 hero 垫底）；
  `:hover` / 滚动后 `.is-solid` / 导航弹层 `[open]` 恢复实心黑（0.2s 过渡）。
- 本地对接：hero（有 bannerImage 时）声明 `data-transparent-header` +
  `.collection-hero-under-header` 负边距上提 65px（CSS 类此前已在 globals.css，
  9-20 时误移除——旧实测过时）。悬停/搜索/滚动的实心恢复走 HeaderShell 既有状态机。
- 全状态实测（Playwright）：到顶透明 bg=rgba(0,0,0,0) / 悬停黑 / 搜索黑 / 下滚实心+阴影 /
  回顶透明 / hero 顶边 y=0；首页保持实心（原站首页未声明透明，不跟风）。

### seed 覆盖事件复盘 + 契约修订（数据运营边界）
- 现象：大爷此前把首页横幅配置为 Mens/Womens（banner-shop 实拍图），下午为补尺码表跑
  `npm run db:seed` 时被 `seedCategories` 的「权威同步」覆盖回注册表默认
  （ox 集合 + **近乎空白的占位图**：banner-ox* 平均亮度 211 / 方差 12 / 颜色桶 18，
  对照实拍图 shop-1 的 39/24/52 —— 即「横图没有图」的观感来源）。
- **契约修订（prisma/seed.ts）**：4 个演示集合的字段分两类——
  · 结构字段（name/nameEn/description/sortOrder）：注册表持续同步（导航结构需随种子可复现）；
  · 视觉/运营字段（image/cardImage/homeSortOrder）：**已有分类一律不动**。
    首轮「仅空值补填」实现被回放验证推翻——`homeSortOrder=null` 是运营的
    「退出首页横幅」显式语义，不能当空值回填（ox-collection 退出后被填回 1 与 Mens 撞位）。
    最终口径：**含 null 在内，既有库的图与横幅次序完全归后台**；仅 create（新库/新集合）给默认。
- 配置恢复（走管理 API，含缓存失效）：Mens=左(1)+shop-1、Womens=右(2)+shop-2、
  ox 两集合退出横幅；seed 连跑三轮回放配置零漂移；首页实测 Mens/Womens 横幅 +
  实拍图 + 占位图残留 0。

## 2026-10-09（四）· 页脚 FOUC 露白修复 + 尺码表数据回填 + 全仓四维体检

> 大爷反馈「部分页面加载时页脚下方露白」「原站有尺码表但本地没有」。
> 验证：typecheck 0 错 / qa:static 三门禁 / 单测 **323/323** / 集成 **172/172** 全绿。

### 页脚露白（FOUC 帧级定位）
- **dev 专用 FOUC 骨架兜底**（`src/app/layout.tsx`）：dev 下 Turbopack 的 CSS 由 JS chunk 注入、
  不阻塞首帧——露白帧实测 `stylesheets=0`、容器 `display:block`，`flex/min-h-screen` 均未生效 →
  页脚紧跟内容、下方露 body 白底（帧级探针：/collections 607px、/cart 705px 各 1 帧；另有 `<p>`
  的 UA 默认 margin 塌陷出页脚形成的固定 16px）。修复：React 19 提升内联骨架
  （`body{margin:0}` + `[data-shop-root]` 满屏 flex 列 + main flex-1），无样式帧页脚也贴底；
  **仅 dev 注入**——生产 CSS 走 `<head>` 阻塞式 `<link>` 首帧即带样式，且内联 style 会撞
  per-request nonce CSP。帧级探针验收：10 页 × 全程采样 **0 露白帧**。

### 尺码表数据回填（数据运营漏洞）
- 根因：**9-26 尺码表注册表迁移后从未重跑 seed** → 28 品 `sizeChart` 全空 →
  PDP 条件渲染（有数据才渲染）永远不成立。跑幂等 `npm run db:seed`：
  补填 **15 个服装品**（T恤/卫衣/连帽衫/童装；帽/杯/袜无表——与原站品类边界一致）。
- 与原站逐格 DOM 比对（ox-hoodie ↔ the-xai-hoodie）：Size/Chest/Sleeve 三行**逐格一致**；
  /zh/ 中文站同步渲染 ✓。种子顺手补建的演示 `admin@example.com` 已删（管理员维持单一账号）。
- 后台可编辑性实测：API PUT 加行 → 前台即时出现 → PUT 还原 → 前台恢复（数据驱动，零硬编码）。

### 全仓四维体检（大爷点名：bug / 硬编码 / 数据孤岛 / 死代码）
- **bug**：verify 全绿 + 集成 172 全过（本轮 6 文件改动后回归）。
- **硬编码**：品牌名/邮箱/电话全走 settings/env 令牌（唯一兜底 `PLACEHOLDER_BRAND`）；
  qa:hardcode 门禁通过；页脚版权 `{siteName} © {year}` 动态。
- **数据孤岛**：前台渲染层零内置注册表（尺码表旧注册表确认已迁移）；FAQ/政策页
  「DB 空时回落内置」为**有文档的刻意兜底**（后台保存优先、编辑不被遮蔽）——
  已知 P2 边界：管理员无法做出「FAQ 全空」的页面形态，非 bug 不阻塞。
- **死代码**：shop/admin 组件、lib、server/services 全量引用计数**零孤儿**；
  src 无 `console.log` 调试残留。

### 工程化
- `.gitignore` 新增 `release/`（源码交付包输出目录）。

## 2026-10-07（二）· PDP 售罄样式与放大光标逐字对齐原站（代理实测取证）

> 大爷连续三轮实拍对比指出差异。x.com 被墙，shell 借本机 xray 代理（socks5://127.0.0.1:10808）
> 直读原站 `theme.css` 与浏览器**计算样式**（含 ::before），全部按实测值复刻。

### 售罄色卡斜杠（buy-panel.tsx）
- 原站 `.color-swatch.is-disabled::before` 实测：`linear-gradient(to right bottom, …)` 色带
  → **正斜杠「/」**、1px（`calc(50%±.5px)`）；未选中线色 `rgb(221,221,221)`(#DDD)、
  选中 `currentColor`(#1C1C1C)——**原站从不用白线**（此前的「对比色白线」是错的）；
  未选中线盒 28×28（=色圆外框，线端顶到方框角 → 略出头）、**选中 margin 归零 → 32×32
  明显画出头**；色圆 28px（34px − 2×1px 边框 − 2×2px padding）；未选中边框 #DDD、选中黑环。
- 同步修正注释口径（rotate -45° = 正斜杠「/」）。

### 规格下拉（variant-select.tsx）
- **面板黑底白字**（bg-foreground / 售罄灰字 text-background/60）+ **售罄文案靠右**
  （规格名居左 justify-between，弃「M — 售罄」内联）——大爷实拍指出的原站形态。
- 单测断言同步（variant-select.test.ts：售罄靠右独立渲染，防回退旧格式）。
- 注：到货提醒弹窗内为原生 `<select>`，option 行右对齐受 OS 渲染限制，保持内联。

### 放大光标（gallery.tsx）
- 抓取原站资产 `cursor-zoom-in.svg`：**36×36 实心白圆(#ffffff) + 居中黑色加号(#1c1c1c)**，
  热点 18,18 —— 大爷描述的「实心白圆中间黑色+号」。替换此前「圆+手柄」放大镜 SVG；
  path 数据与原站逐字一致，页面计算样式实测对齐。

## 2026-10-05（日）· 商业交付审查批次（安全 / 资金 / 工程化 三路并行复查）

> 交付前按资深全栈标准做三路独立复查，本轮修复 **14 项**；全部带文件级证据与回归验证。
> 验证：typecheck 0 错 / lint 0 错 / qa:static 三门禁 / 单测 **310/310** /
> 集成（COD·下单·资金完整性·分销）全绿 / 生产构建 exit 0。

### 安全（3）

- **邮箱验证令牌绑定当前邮箱**：此前只取 `payload.sub`，用户换邮箱后（`emailVerified`
  被重置）**旧邮箱收到的旧链接仍能把账号置为已验证**，绕过「未验证不得下单」门控。
- **公开搜索端点限流 + 长度上限**：`/api/search/pages` 含 `"sizeChart"::text ILIKE`
  全表扫且无限流，可刷满 DB CPU —— 现为单 IP 30 次/分钟 + 全站熔断 600 次/分钟 + q≤80 字符。
- **console 邮件通道止血**：收件人日志脱敏（redact 只覆盖 `email` 字段名，`to` 不脱敏）、
  生产环境不再落盘（含验证 token 的 HTML 曾被写入容器磁盘）并给出明确告警。

### 资金 / 业务（4）

- **COD 排除自动确认收货**：丢件/拒收时 15 天后曾被自动置 DELIVERED 并写 `paidAt`
  （假收款），据此**结算分销佣金并开放全额退款** —— 平台钱货两空。
- **退款回补库存与退货挂钩**：已发货（SHIPPED/DELIVERED）退款曾无条件回补库存 ——
  货未退回即回补会让已卖出的货被再次售出（真超卖）。现仅未发货订单回补。
- **COD 管理员退款守卫**：顾客入口有拦截但 admin 状态接口仍可 `PROCESSING→REFUNDED`
  （从未收过现金）→ 假退款台账；现拒绝并引导走「取消订单」。
- **订单号冲突换号重试**：订单号 6 位随机（90 万/日空间），高单量必然碰撞，
  此前 P2002 只处理 `idempotencyKey` → 撞车直接丢单；现识别并换号重试 3 次。

### 工程化（7）

- **`CRON_ENABLED` 死开关落地**：该变量此前全仓无读取方，文档承诺的
  「维护/迁移窗口可关闭」不成立（订单超时/对账/结算照跑写库）。
- **`.env.test` 出库**：含测试库连接串与弱密钥却被 git 跟踪 —— 已 `git rm --cached`
  + 补 `.gitignore` + 新增 `.env.test.example` 模板。
- **CI 接入 `qa:static` 门禁**：硬编码扫描/顾客可见错误文案语言/静态死链此前零 CI 门禁。
- **补齐 7 个外键索引**（migration `20261005100000_add_missing_fk_indexes`）：
  PostgreSQL 不为 FK 自动建索引，`groupBy fromUserId`、物流方式删除计数等曾走全表扫。
- **i18n 词典键同步** + 修复漏到后台界面的 Markdown 星号（渠道页文案）。
- **仓库卫生**：开发规划产物出库（findings.md / task_plan.md / progress.md / .workbuddy-ai/）。
- **README 对齐**：CI 任务说明由「四个」更正为实际八个（含 compose 全栈冒烟）。

### 未完成（下期）

分销「仅缺 level-2+」漏补（需链深比较）｜sanitize / variant-select / instrumentation 补测试｜
CI 加备份恢复演练｜PDP 缓存｜user/export 等限流缺口｜settings GET 对 SUPPORT 的字段白名单。

## 2026-10-04（六）· 商用交付体检 P0 批次：Docker 构建 / 依赖门禁 / 登录双缺陷 / COD 币种 / 变体加价全链路

> 全栈交付体检（独立四线并行：安全 / 资金 / 运维 / 文档真实性）发现的 P0/P1 修复。
> 本批全部有复现证据与回归测试；`tsc` 0 错、单测 **310/310**、关键集成（auth/cod/shop-flow/
> commercial-hardening）**20/20** 全绿、生产构建 exit 0。

### P0-1 Docker 构建在 deps 阶段即失败（部署完全不可用，已修）

- **根因**：`postinstall: prisma generate` 在 `COPY prisma/schema.prisma` 之前运行，
  `npm ci` 在 deps 阶段因找不到 schema **exit 1** —— `docker compose up --build` 与
  CI `docker-smoke` 在第一步全部挂掉（与 Dockerfile 注释里记录的上一次 P0 同类，
  换了个形式复发）。已用临时目录**独立复现**确认（修复前 exit 1 / 修复后 exit 0，
  Prisma Client 正常生成）。
- **修复**：deps 阶段在 `npm ci` 前 COPY `prisma/schema.prisma`（builder 本就显式
  `prisma generate`，依赖层缓存只受 package*.json + schema 影响）。

### P0-2 CI 依赖审计门禁常红（10 high，运行时 0 容忍，已修）

- `undici`（**运行时**链 isomorphic-dompurify→jsdom，sanitize 用）经 `npm audit fix` 修复。
- `nodemailer` **运行时**依赖，新增 advisory 含「跨租户 SMTP 凭据泄露」（进程级 DNS 缓存
  复用 TLS servername）——升级 `^9.1.1 → ^10.0.13`；`@types` 改命名导出后同步调整
  `mail/index.ts` 的 `Transporter` 类型引用。API 面（createTransport/sendMail）无变化。
- `braces`（GHSA-vfj7-8cjw-p6xm）**无任何已修复版本可升**（3.0.3 即最新），唯一根治是
  tailwind 4 迁移（另行立项）；经查它由 **`tailwindcss-animate` 被误放进 dependencies**
  拖入生产树 —— 已移回 devDependencies（它只在 `tailwind.config.ts:172` 构建期使用），
  生产树从此不含该链。
- CI audit 门禁改 `--omit=dev`：**运行时依赖零容忍**（现在 0 漏洞、exit 0），
  dev 工具链（文件监视/静态分析）已知问题单独立项跟踪，不再把门禁打成永久红。

### P1-1 登录双缺陷（账号枚举预言机 + 邮箱单键锁定 = 未授权永久 DoS，已修）

- **枚举预言机**：`DISABLED` 分支在 `verifyPassword` **之前**直接 403 —— 任何人不用
  口令即可区分「已注册且被禁用」vs「未注册」，且免 bcrypt 形成时间侧信道。已移到
  口令校验之后（持正确口令者才可见 403，与「口令错误」的 401 不可区分）。
- **锁定 DoS**：`login-lock` 原为**纯邮箱**键、进门即计数 —— 知道受害者邮箱的人
  5 次错密码即可让其（含管理员）永久无法登录。重构为两层，且**只在真实口令失败后计数**：
  硬锁键改 `ip+email`（攻击者只能锁自己的 IP 组合）；跨 IP 兜底保留邮箱维度
  （10 次/15 分钟硬锁 + 第 4 次起 0.5s→10s 指数延迟），成功登录清零、
  触发硬锁落审计告警。限流器为此新增 `peekRateLimit`（只读不递增，peek+hit 分离）。

### P1-2 COD 到付费币种错配（非 USD 订单收错现金，已修）

- `codFee` 落库的是 **USD 基础价**，而 `total` 等全部是**订单币种** —— 订单页/邮件/
  后台「送达应收现金 = total + codFee」把美元数当本币相加（EUR/¥ 订单系统性多收）。
  已改为按订单汇率快照换算后落库，全链路两侧同币种；schema 注释同步口径。
  `cod-flow.test.ts` 断言改为**按订单自身汇率快照自洽**（任何测试币种下成立，比死值更强）。

### P1-3 变体覆盖价全链路生效（「大码加价」被静默丢弃 = 系统性少收，已修）

- **根因**：`ProductVariant.price` 后台可编辑、可落库，但下单小计/行小计/`OrderItem.price`/
  券试算/购物车**全部只读商品价**；唯一能暴露它的 `variantPriceRange()` 全项目零调用点。
- **修复**：新增 `effectiveUnitPrice()` 作为全链路唯一取价口径（窄结构，前后端共用）——
  下单事务（计价与扣库存复用**同一**解析结果，二者永不漂移）、`quoteOrderAmounts`、
  `getCart`、`/api/cart/preview`、游客车共享读取器、立即购买结账全部切换；
  PDP 存在覆盖价时显示「min – max」价格区间（选中前即披露加价），JSON-LD 按区间下限输出。
- 单测 +6（覆盖窄结构/字符串 Decimal 形态/非法回落），上线走查清单补「变体加价」人跑项。

### 文档纠偏

- `PRODUCTION_CHECKLIST.md` 删除三处**已下线功能**（联系表单 `ContactMessage`，
  2026-09-23 已移除）的强制项 —— 此前运维按该清单会被不存在的功能卡住上线；
  登录限流口径同步更新为新设计。

### 第二批：观测性 / 对账饿死 / 渠道凭据 / admin 限流 / compose 门禁

- **服务器引导钩子 `src/instrumentation.ts`**（Next 16 file convention，v15 起稳定）：
  `register()` 启动即初始化 Sentry + 拉起 cron 调度器（幂等守卫共存）—— 此前
  两者都是「首个请求触发的懒加载」：**页面渲染（RSC）崩溃对 Sentry 完全不可见**
  （error boundary 只 console.error），冷启动后到首个请求前订单超时取消/退款
  重试全部不跑。`onRequestError` 钩子把服务端捕获的所有错误（含 RSC 崩溃，
  digest 可关联客户端）上报，只取 path/method（PII 纪律，与 logger 脱敏同口径）。
  注：docs 示例的 `Instrumentation` 类型未从 `"next"` 公开导出（16.3.6 实测），
  按内部 `InstrumentationOnRequestError` 签名结构化书写。
- **分销对账三处饿死/漏扫修复**（资金审计 M4/M8）：
  ① 漏计佣扫描补 OR 信号——「归属有直推分销商却缺 level-1 流水」的部分计提单
  从此可被重试（`accrueForOrder` 差集幂等，重跑即补、永不双记；此前只选零佣金单，
  `commission.service:337` 注释宣称的「对账补偿会补」对部分计提落空）；
  ② 冲正/结算扫描加 **90 天水位**——「已追平但未全额冲正」的流水按设计永远
  `status != REVERSED`，不设水位会永久命中并占满 `take:limit` 批次，把新退款单
  挤出兜底扫描。覆盖性不变：新退款事件由 refund 侧查询按 refund.createdAt 捞
  （与订单年龄无关）；超龄订单结算由 `settleDueOrders`（paidAt 截止、无水位）兜住。
- **渠道化支付凭据落库**（资金审计 H3 结构修复）：非 Stripe 渠道的
  `createPayment` 返回的网关侧会话/交易 id 此前只进 PaymentLog、不挂订单 ——
  回调永久丢失时订单与网关交易之间无任何外显关联（钱被扣、单已取消、无法人工
  退款）。现在与 stripe 分支同语义写 `paymentSessionId`（mock 站内收银台除外）。
  四个预留渠道 `isReady=false` 不可达，但下一个接真实网关的渠道不再继承该缺口。
- **admin 导出/上传限流**（安全审计）：订单导出（单次 5000 行收件人 PII）单管理员
  4 次/10 分钟；本地直传 + S3 预签名共用 30 次/10 分钟 —— 此前 admin 路由除
  mail-test 外零限流，被盗/内部 SUPPORT 会话可无限循环拉取。
- **CI 补 compose 全栈冒烟门禁**（运维审计 H2）：新增 `compose-smoke` job 跑
  `scripts/smoke-compose.sh`（构建→起完整栈→迁移→种子→健康→关键页→后台登录→
  日志无 ERROR）—— compose 是文档承诺的部署路径、历史上两次 P0 都发生在编排层，
  而 raw `docker run` 的 docker-smoke 探不到（env 插值/SEED_ON_START/depends_on
  健康门/minio 初始化）。
- 验证：typecheck 0 错、单测 310/310、分销集成 43/43、支付/调度/下单/资金
  集成 32/32 全绿。


## 2026-10-01（四）· 分销系统衔接稳健性审核 + 工程化落地检查（大爷点名「分销能不能稳健地跟主站衔接好」）

### 分销 ↔ 主站衔接：审核通过（无需改动）

- **bridge 隔离层**（`server/services/distribution/bridge.ts`）：三条铁律完整——
  商城只 import 本文件（grep 全站验证 0 处越界）；所有钩子 try/catch 吞异常
  （分销故障不影响下单/支付/发货/退款生命线）；`DISTRIBUTION_ENABLED=false`
  即与接入前行为一致；动态 import 懒加载（分销的编译/循环依赖问题不出现在
  商城启动路径上）
- **钩子挂载 8 处齐全**：注册绑定 / 订单归属 / 支付计提（幂等）/ 收货补计提+
  结算（COD 在此时确认收款）/ 退款冲正×2（取消+网关）/ webhook 侧冲正 /
  对账补偿+团队汇总（调度器每分钟）——钩子是加速器，`reconcileDistribution`
  每分钟兜底漏记/漏冲正
- **资金安全**：提现申请=条件更新扣余额（`balance >= amount`）+「扣款与落单
  同事务」+ 数据库部分唯一索引（一人一笔在途，撞车 P2002 翻译成同一提示）+
  KYC 实名强校验 + 日/月风控限额；佣金计提/冲正幂等，并发测试实测收敛
- **对账口径**：物化汇总 vs 流水推导（每条可独立验证），漂移可自动修复；
  注销匿名化完整覆盖佣金/提现/换绑记录 + 管理员通知
- **UI 入口自洽**：账户页分享卡按 `identity.isDistributor` 显示「进入分销中心」
  （与后端「首次推广自动升级」一致）；顾客侧分销中心 7 个子页齐全
- **测试**：分销单测+集成+并发 **89/89 全绿**（含 1000 人团队闭包查询性能上界、
  并发「结算+部分冲正」余额收敛）

### 工程化落地检查

- `qa:hardcode` **P0 = 0**（硬编码美元金额/品牌/联系方式清零——此前 DUMMY
  hash 误报与 5 处错误文案已修）
- P1 提示级（非阻断）核实：后台中文字面量=正常（后台是中文产品）；政策页
  中英双语默认值在源码里（`policy-defaults.ts`）按请求语言取用，**不泄漏**；
  像素魔数 118 处为版式数值（收口 CSS 令牌的工程化改进，已有先例，随死代码
  清理一并做）
- 最终质量门：**tsc 0 · verify exit 0 · 单测 28 文件 301/301 · 集成 21 文件
  172/172 · 分销 89/89**

## 2026-10-01（四）· 图随规格联动 + 下拉「抖动」排查结论

### 图随规格联动（大爷需求：选了颜色/规格后，大图切到该组合的图）

数据模型就绪（`ProductVariant.image` 组合图字段），补齐三处联动：

- **BuyPanel**：选中组合变化时广播 `variant:image` 事件（与 `cart:open` 同款模式，
  左右两栏解耦——BuyPanel 管选中状态、Gallery 管图集）
- **Gallery**：监听事件，把组合图**前置到大图首位**（官方 Shopify 行为：选颜色 →
  主图切到该颜色）；组合图切换时大图自动回到首位；只响应本商品的事件
- **PDP**：`activeVariants` 带 image 下发；Gallery/BuyPanel 传 productId 过滤
- **后台表单**：矩阵区新增「组合图（按父组配图）」编辑块——按**第一个属性组
  （父组）的取值**配一套图（电商惯例：黑色一套图、白色一套图，尺码不换图）；
  保存写入该父组值名下全部组合的 image；未配 = 全部用商品主图

真浏览器验证：初始大图=商品主图 → 选 White → 大图切到 White 的图 → 切回 Black →
Black 的图（组合图配置驱动，不硬编码属性名）。

### 规格「下拉菜单抖动」排查结论：产品无布局抖动（不改）

大爷反馈：「颜色选好后点下面关联的规格下拉菜单后，页面感觉抖动一下，感觉是加载」。
真浏览器三层实测（滚动状态 + 帧级采样）：

- **布局高度全部恒定**：右栏 773px / 数量行 48px（「仅剩 N 件」与数量输入**并排**，
  出现/消失不占新高度）/ 按钮区 46px（两按钮同高互换）
- **帧级采样零跳动**：点颜色色块的 20 帧每帧布局完全相同（773/0/48）
- **滚动位置不跳动**：scrollY 恒定、下拉框位置恒定；选中选项后 25 帧恒定
- **console 无水合错误**

「抖动一下/加载感」的来源：Radix 下拉内容是**打开时才挂载**（弹出动画 +
约 120ms 的挂载延迟，dev 下含编译开销、生产更快）——这是 Radix Select 的
标准行为，非 bug，不改。

> **运维提醒**：dev 模式下梦哥改代码会触发 Fast Refresh 整页重载（上下文类
> 文件无法热替换），页面开着会看到反复白屏——「颤抖」的另一来源，生产构建
> 不存在。

## 2026-09-30（三）· 编辑表单规格库存保存被整体丢弃：payload 缺 variants（大爷第二报）

报障原文：「弹层填的库存前端可以正常使用；点编辑入口填写的库存就不行，很快
恢复为 0；库存为 0 前端也没反应；唯独大表弹层填入的能用。」

排查（真浏览器抓取 PUT 请求体定位）：**编辑表单的 PUT 请求体里没有 variants
字段**——前一轮重构 handleSubmit 时把 `variants` 从 payload 里弄丢：

- 服务端 `variants === undefined` → 跳过组合落库 → 填写的规格库存**整体被丢弃**
  （DB 变体保持旧值，重开表单「恢复为原值/0」）
- `stock` 按表单 Σ 落库但变体没动 → 商品级 stock 与变体之和**脱节**——前台
  的售罄判定/可售量读的是**变体**数据 → 「库存为 0 前端也没反应」
- 大表弹层路径直接发 variants → 一切正常（「唯独弹层的能用」）

### 修复
1. `handleSubmit` payload 补回 `variants: values.variants ?? []`
2. 前端 zod schema（`productFormSchema`）的 variants 补 `expectedStock` 声明——
   zodResolver 默认 strip 未知字段，不声明则 draft→variants effect 写入的
   乐观锁快照被剥掉，表单路径失去防复活超卖保护（连带隐患，排查中发现）

真浏览器验证：PUT 请求体含全量 variants（stock=7 + expectedStock=6 乐观锁快照）；
DB 变体 6→7 落库；重开表单预填 7（不再恢复旧值）；商品级 stock=19=Σ ✓。
前台售罄联动闭环：3XL 填 0 → PDP 下拉显示「3XL — Sold out」→ 还原 ✓。

## 2026-09-30（三）· 大表库存编辑「入不了库」报障修复：409 死循环 + 弹层实时拉最新

大爷报障：「点编辑后填好后怎么就入不了库？我在大表上点开库存还是原来的老库存」

排查（真浏览器完整重现 + API 直连对照）：后端保存链路实测正常（PUT 200、行数据
更新）；断点在**乐观锁的 UX 闭环**，两个缺陷叠加造成「永远保存不上」：

- **缺陷 1（409 死循环）**：保存撞上乐观锁（expected ≠ 库内现值）→ 409 后弹层
  保持打开、expectedRef 还是旧快照 → 再点保存**永远 409**（toast 报
  「库存已被其他操作变更」但数字永不更新）。修：409 时**关闭弹层 + 刷新行数据**，
  重新点开编辑时 expected 随打开重置。
- **缺陷 2（expected 用过期行快照）**：expected 来自「列表加载时」的行数据——
  页面开着期间有下单扣减/其他保存时快照过时，一保存就 409。修：**打开弹层前
  实时 GET 最新商品详情**（`startVariantEdit` 异步拉取），expected 与库内现值
  对齐，从源头消除这类 409；弹层渲染/保存的数据源同步切到最新商品
  （`variantEditProduct`）；拉取失败用行数据兜底（保存时仍有乐观锁兜底）。

真浏览器验证：打开弹层预填**最新库存**（过期行快照场景实测预填 2,2,2…，
不再用过期值）；保存成功行数据更新（6+2×6=18 ✓）。此前因 Prisma 嵌套 upsert
不接受标量外键（`Unknown argument productId` → 500）的回归也已修复
（改显式 diff：update/createMany/deleteMany 顶层操作）。

> **运维提醒**：dev server 长时间运行后 Turbopack 文件监视可能失效（改动后
> 路由仍用旧编译），遇到「改了没生效」先重启 + `rm -rf .next`。

## 2026-09-30（三）· 全项目商用交付体检：修复 10+ 项（复活超卖 / 游客链路 / 支付死循环 / 防枚举）

4 领域并行审计（订单/支付、前台购物、后台管理、安全/性能/数据完整性）+ 人工复核。
**P0 交付阻断：认证绕过/注入/密钥泄漏/下单并发超卖/级联丢财务数据均未发现**
（103 个 admin 路由 RBAC 逐一验证零缺失；行锁/幂等/防超卖/资金链路完整）。

### P1 商业逻辑（已修）
- **后台编辑 variants 复活超卖（全项目离 P0 最近的洞）**：PUT 此前 deleteMany
  全量替换 + 按「表单加载时」快照重建——管理员打开表单后顾客下单扣减，保存时
  （哪怕只改标题）快照把已卖库存复活 → 超卖；多管理员并发编辑后保存者整体覆盖。
  现改**乐观锁 + diff 落库**：前端上送 expectedStock（加载时快照），服务端在
  products 行锁内（FOR UPDATE，与下单扣减串行）比对，不一致 → 409
  「库存已被其他操作变更，请刷新后重试」；传入组合按签名分拣 update/createMany、
  矩阵外旧组合定点删除（不再全表 deleteMany）。实测冒烟：过期快照 409、
  正确快照 200、新增组合 200。
- **proxy 静默续期绕过 refresh 限流**：单飞只对「同 token 并发」生效，脚本化
  顺序轮换链（每次用新 token）可无限灌 refresh_tokens 表。静默续期分支加同款
  IP 限流（10/min，与 /api/auth/refresh 同策略）。
- **游客组合粒度未贯通**：preview 只返回商品级 stock → 游客购物袋/结账页全是
  总库存，售罄组合显示有货、结账提交才报错。preview 下发 variants 明细，
  guest-cart / cart-provider / checkout-flow 按所选规格用
  `variantAvailableQuantity` 算行级可售量（与登录用户同一函数）。
- **游客下单成功不清 localStorage**：付款后购物车照旧、可重复下单。下单成功
  即清游客车（登录单走服务端车，事务内已清）。
- **reorder 未接组合粒度**：specAvailableQuantity 不传 variants 回落总库存，
  「组合剩 2、总量 50」的行不被压量 → 整行被跳过。传入 variants 同口径。
- **预售单次上限不统一**：PDP 承诺最多 5 件，但抽屉 max=99、合并封顶 99、
  服务端下单无上限。收口 `lib/inventory` `MAX_PRESALE_QTY=5`（单一事实来源）：
  下单入口直接封顶订单行数量（小计/扣减/回补/销量同口径，API 直调无法绕过），
  抽屉/合并/购物车页五处统一。
- **领券中心金额不按访客币种换算**：formatMoney 是 USD 基准——CNY 访客看到
  商品 ¥、券卡 "$"；EUR 下两种格式混用。改 convertPrice + formatAmount
  （与全站同一口径）。
- **sitemap 无缓存 + 静默截断 + 无索引**：force-dynamic 让每次爬虫抓取全量查库
  （50 万行 seq scan）；take 5000 静默截断更早商品无任何线索。改 revalidate 3600 +
  截断告警（提示切换 generateSitemaps 分片）+ Product 加
  `[status, updatedAt(sort:Desc)]` 索引（db push 已落库）。

### P2 明显 bug（已修）
- **下单清购物车按 productId 整删**：同商品 Size S + M 两行只下单 S → M 行也被
  误删。改按 (productId, attributesKey) 逐行匹配。
- **mock 渠道支付死循环**：「PAYMENT_MODE=stripe + 后台启用 mock 渠道 +
  ALLOW_MOCK_PAYMENT_IN_PROD=true」组合下 createPaymentUrl 放行、mock-pay 恒 403
  （口径不一致）——顾客进模拟支付页无法支付，订单 30 分钟后自动取消。mock-pay
  守卫改按**订单支付渠道**判定（与渠道分发一致）。
- **登录防枚举缺口**：不存在邮箱直接 401（无 bcrypt），与存在邮箱的 bcrypt 12 轮
  秒级时间差可批量探测已注册邮箱。用户不存在时对固定 dummy hash（base64 存放，
  运行时解码——`$2` 前缀会被 qa-hardcode 的美元金额规则误判）跑同成本比对。
- **取消/退款回补后变有货的商品不触达到货提醒**：变体分支此前 continue 跳过
  restockedProductIds；变体 + 非变体分支都进累加器，事务后 notifyRestock
  （网关退款路径同样补齐）。
- **forgot-password 回执硬编码中文**：成功载荷不走 apiHandler 错误本地化出口，
  英文用户看到中文回执。改英文源串（前端表单用自己的 t() 文案，不受影响）。
- **CSP img-src 硬编码 `https://*.amazonaws.com`**：MinIO/R2/CDN 部署的商品图
  全被 CSP 拦截。改从 S3_PUBLIC_URL 派生主机追加白名单（配置派生，不写死云厂商）。
- **调度器清理 deleteMany 无批上限**：单条 DELETE 删数十万行 → 长事务、行锁持有、
  WAL 突发。改 1000 行/批循环删除（Prisma deleteMany 无 take：findMany 取批 +
  按 id 删），每批独立短事务。
- **PDP「仅剩 N 件」用商品总量**：组合剩 2/总量 8 漏提示、总量 3/组合 20 错误
  提示。改用当前组合库存（effectiveStock）。
- **JSON-LD availability 不反映预售**：预售 stock=0 输出 OutOfStock 与「可预订」
  矛盾（Google Merchant 误判）。改 isPresale → `schema.org/PreOrder`。
- **颜色 swatch 选中值可从选择器消失**：选 Black 后把 Size 切到 M（Black/M 不
  存在）→ Black 色块被过滤，标签仍显示 "Color: Black" 且无法点回。当前选中值
  保留渲染 + 售罄划线。
- **购物车抽屉不做缺货闸门**：有缺货行仍直达 /checkout，填完表单提交才报错。
  与 /cart 页同口径：结账按钮切「先处理缺货」。
- **变体商品加购允许无规格行**：无规格行在变体商品上是「死行」（可售量恒 0），
  行标缺货、阻断结账。加购入口直接拒绝并指明「请先选择规格」。
- **cart-provider 字面量 50** → MAX_CART_ITEMS（含词典参数化同步）。
- **checkout 幂等键 crypto.randomUUID 无兜底**：纯 HTTP（非 localhost）部署下
  TypeError 下单不可用。回退 randomToken（getRandomValues 不受 secure context 限制）。

### 体检后 verify 恢复全绿
此前 `npm run verify` 实际挂在 qa:error-lang（5 处顾客可见错误文案硬编码中文，
见上一条目）与 qa:hardcode（bcrypt hash 误报）。两处修复后：
**tsc 0 · verify exit 0 · 单测 28 文件 301/301 · 集成 21 文件 172/172**。

## 2026-09-30（三）· 多属性组合库存：全链路统一（父组只读 + 存量全兼容 + 五个真 bug 修复）

大爷定稿业务模型（全站唯一口径）：**第一个添加的可选属性组 = 父组，后面添加的都是
子组；有子组的父组不能手写库存（恒等于其名下子组规格之和）；商品总库存 = 全部组合
之和（服务端重算）；单规格商品才直接填总库存。全程不硬编码任何属性名**——颜色/尺码/
材质/容量，任何属性当父组都走同一逻辑。

### 排查揪出并修复的 5 个真 bug

1. **「可选规格」勾选不落库**（`lib/validations/product.ts`）：zod schema 缺
   `selectable` 字段 → strip 静默剥掉表单勾选——单值可选组落库即「消失」，大表
   保存组合库存时还会把存量商品的 selectable 信息一并洗掉。已补字段。
2. **购物车校验没接变体**（`server/services/cart.service.ts`）：变体商品加购回落
   总库存 Σ 校验，「黑/S 售罄但白/M 有货」的售罄组合能加进购物车、下单才报错
   （前台体验断裂）。`addToCart` / `updateCartItem` / `mergeLocalCart` / `getCart`
   四处全部按组合粒度判定（新纯函数 `variantAvailableQuantity`，
   `server/services/variant-stock.ts`），购物车行级库存 = 组合真实可售量。
3. **到货通知对组合粒度商品整条是断的**：变体商品的**所有**到货提醒登记被 API
   误拒 400（组合售罄根本登记不上，顾客点「到货提醒」直接报错）；补货触发也不按
   组合匹配（变体商品 specStock 为空时任意补货会把「从未售罄」的组合也通知出去）。
   登记守卫（`api/notify-me/route.ts`）与 `notifyRestock`（`notify-me.service.ts`）
   都按 `findVariant` 组合定位（与下单/购物车同口径），组合回货才通知该客户。
4. **大表与表单数据打架**：大表内联编辑走 specStock、表单保存时又清空 specStock
   （大表改的库存被表单悄悄抹掉）；PUT 删光组合时固定回落旧库存（「删光规格改回
   单品 + 手填库存」的输入被静默丢弃）。都修。
5. **直改总库存守卫漏判**（`api/admin/products/[id]/stock`）：只查维度池，单值
   属性组的变体商品被放行直改，stock 与组合之和脱节。已补变体判定
   （`productVariant.count`）。

### 商品编辑表单（`components/admin/product-form.tsx`）

- 删除「分组方式」下拉——**固定第一个添加的组为父组**（顺序即业务，不可切换）
- 删除 ~100 行维度池死代码（specMaps / specSum / 迁移 effect）
- 修 `hasGroups` 口径 bug：勾了可选但值未填时，库存输入框可编辑、提交却按组合
  汇总（用户输入被静默丢弃）——统一用 `selectableGroups.length > 0` 判定
- 修新建带规格商品被 zod stock 必填拦截：库存输入框是只读展示（绑 matrixTotal），
  但 zod 校验看表单值——回写 effect 补上
- 矩阵 UI：属性行带**父组/子组徽标**（按添加顺序动态判定）；父组卡片标注
  「父规格」+ 右侧只读「库存合计」；子组规格横排小单元；总库存实时联动只读
- 组合键统一用后端 `variantSignature`（前后端同一算法，杜绝「前端键 ≠ 后端键」）
- 保存保留已存组合的覆盖价/SKU/组合图/上架状态（矩阵只管库存，不洗其它数据）

### 商品管理大表（`app/admin/products/page.tsx`）

- 库存列统一为「组合矩阵弹层」：只要有任何规格数据（variants / 可选属性组 /
  specStock）→ 不点显示总库存（悬浮 title 可见各父组合计与子组明细），点铅笔
  弹出父组×子组矩阵；多属性组按父组取值分卡片（卡片头「父组名：值 + 只读合计」，
  组内子组规格横排）；单属性组平铺一行三个
- **数据源并集（存量全兼容）**：属性可选组 ∪ variants 组/值 ∪ specStock 存量键
  （孤儿维度池组不进矩阵）；预填：组合数据 → 维度池每组合取最小值（保守）→
  全 0 待补录（如 Ox Kids Constellation Hoodie：勾了 Color+Size 但组合从未生成，
  弹层直接给出完整矩阵，填完保存即创建组合）
- 保存走 PUT variants（服务端重算总库存 + 清空维度池）；**旧维度池编辑器整个废弃**
  （连同 specEditId / specGroupsOf / specQtyOf / saveSpecStock 全部删除）；
  维度池存量商品（Ox Reflective Tee 等）保存后收敛为组合粒度，数字守恒
- 单品（无任何规格数据）保持直改总库存（PATCH 守卫放行）

### 后端 API

- GET 列表 include variants（大表弹层数据源，按 createdAt asc 保证组合顺序=录入顺序）
- PUT：有组合 → stock 强制 = Σ；删光组合回落 specStock 汇总 → input.stock → 原库存；
  include variants（响应自描述）
- PATCH /stock：守卫补变体判定（有组合/可选属性组都拒直改；**孤立的 specStock 不拦**
  ——组名不在属性里的维度池残留没有可选规格可管理，直改无脱节风险）

验证：tsc 0 · 单测 **301/301** · 集成 **21/21**（spec-stock-consistency / notify-restock /
admin / shop-flow）· 全链路 API 冒烟 **15/15**（建商品手填 999 被拒 → Σ 重算=15 →
改组合重算=18 → 直改 400 → 删光回落手填 → 加购售罄组合 400 → 行级库存=组合库存 →
到货通知登记：售罄可登记/有货被拒）· 存量场景 **10/10** · Playwright 真浏览器大表
UI 实测 **7/7**（两种存量商品弹层出现、输入框数量正确、存量预填、父组卡片+合计可见）
· PDP 数据链 **6/6**（父组值/子组值/售罄标示全部来自真实组合数据）

## 2026-09-28（日）· 规格库存矩阵：默认启用 + 父组只读汇总 + 单组标签修复

大爷连续反馈：「录入库存时就应该分组，什么颜色下面都有对应的尺寸规格」「分组后
上一组就不能手写，而是有子组的数字汇总」「不能都可以编辑，那数字不符合逻辑，以后
库存就出乱子」「还是没看到改变，还是各写各的库存，一点业务逻辑都没有」

- **矩阵默认启用**：此前矩阵只是个**默认关闭的开关**，运营打开商品看到的是老的
  维度池（各写各的）——这就是「没看到改变」的直接原因。现去掉开关，只要有可选
  属性组就走组合粒度
- **父组只读汇总**：分组头显示「库存合计 N」（由组内组合实时求和），新增顶部
  「商品总库存（自动汇总，不可手写）」只读条；**只有最末级组合可录入**
- **维度池与矩阵互斥**：矩阵启用时不再渲染「规格库存」维度池区（两套模型并存
  必然出现「父维度数字 ≠ 组合之和」= 大爷说的乱源）；老商品按 specStock 的
  **各维度最小值**预填矩阵草稿（保守不放大可售量），运营逐格修正后保存
- **提交口径**：有属性组时只提交组合粒度（`specStock` 清空），商品级 `stock` =
  Σ 组合库存，与后端落库口径一致
- **分组维度动态**：新增「分组方式」下拉（任意属性组都能当分组头，不硬编码）；
  仅一个属性组时自动平铺（无分组头）
- **修复单组标签 bug**：只有一组属性时，行标签此前被 filter 掉退化成「默认」
  （浏览器实测截图发现）→ 改为显示该组的值（如 `Patterned Black` / `White`）
- **更正一处误判**：`selectable` 未手动勾选时按「取值 > 1」**自动启用**，因此
  矩阵此前其实已在渲染；真正的可见性问题在「开关默认关 + 单组标签退化」

验证：tsc 0 · lint 无新增 error · **Playwright 登录后台实拍编辑弹窗确认**：
「规格库存（按组合录入）· 商品总库存（自动汇总，不可手写）0 件」+ 逐组合输入行
（`Patterned Black` / `White`）正常渲染

## 2026-09-28（日）· 首页/分类横幅换原站 hero + 商品页 404 事故复盘

### 横幅本地化（大爷：「把横栏图也加上去」）
- 新增 `scripts/fetch-shop-banners.mjs`：抓原站首页 hero（`X_Model_v4.jpg`
  1440×807 与 `xAI_Model.png`，均 16:9）→ sharp 压到宽 2400 / jpeg q88 →
  落盘 `public/images/demo/banner-shop-{1,2}.jpg` → 4 个分类的
  image/bannerImage/cardImage 轮换指向（首页轮播 + 分类页大图同步生效）
- **技术点（重要）**：hero 图在**店铺域名**（`shop.x.com/cdn/...`）上，被墙；
  Playwright 的 `ctx.request` **不走浏览器网络栈**（ECONNRESET）。必须用
  **页面上下文内 fetch**（`page.evaluate(fetch)` + base64 回传）才能过墙。
  而商品图在 `cdn.shopify.com`（本身可达）故可直接下载——两者差异就在域名。

### 事故复盘：加 ProductVariant 后 dev server 未重启 → 全部商品页 404
- 现象：商品详情页全部 404（「我们找不到您要访问的页面」）
- 根因：`npx prisma generate` 重新生成了 Client，但 **dev server 进程仍持有旧
  Client 模块**（Node require 缓存）→ `include: { variants: ... }` 运行时报
  `Unknown field 'variants' for include statement on model 'Product'` →
  被 service 兜底成 notFound → 404。日志里有完整 Prisma 报错可查。
- 修复：重启 dev server（重新加载 Client）
- **运维教训（已写入本节）**：**任何 schema 变更（新增模型/字段）后必须重启
  dev server / 生产进程**，`prisma generate` 只更新磁盘产物，不影响已加载的进程。
  排查手法：`tail` dev 日志找 `Unknown field` / `Unknown arg` 类 Prisma 报错。

## 2026-09-28（日）· 商品图片本地化：换用原站商品图（大爷要求「看效果」）

> 大爷要求：「把商品的图片都换成原网站的」「下载到本地，不要用网上的 url」「主要看效果」。

### 关键突破：curl 过不去、浏览器过得去
本机命令行到 `shop.x.com`（SpaceX/xAI 官方商店，Shopify 托管）被 TLS reset（HTTP 301
强制 HTTPS、服务端代理工具与 web_fetch 均不通），但 **Playwright Chromium 走系统
VPN → 200**（实测 title「Official SpaceXAI Shop」）。据此用浏览器上下文抓取。

### 落地
- 新增 `scripts/fetch-shop-images.mjs`：浏览器内 `fetch /products.json` 取全量商品与
  图片 URL → 按**品类关键词**（tee/hoodie/hat/beanie/tumbler/sock/shirt）把原站商品池
  映射到本地演示商品（同品类轮转，避免 T 恤配帽子）→ 逐图下载（浏览器上下文带
  UA/cookie 最稳）→ `sharp` 压缩为 WebP（最长边 1600, q82）→ 落盘
  `public/images/products/<slug>/<n>.webp` → 更新 `Product.images`
- 另留 `scripts/import-product-images.ts`：从**本地文件夹**导入（按文件名含 slug 匹配），
  供「浏览器另存图片」的离线路径使用
- 结果：**28/29 个商品**换为原站图（每个 2–6 张，共 14MB 本地 WebP）；唯一未换的是
  `ox-remove-before-flight-keychain`（钥匙扣）——**原站无此品类**，保持本地演示图
  （不硬塞无关图）

### ⚠️ 合规口径（必须遵守）
这些图片版权归原站所有，**仅可用于内测看效果**。商业发布前必须替换为自有素材或取得
授权——已写入 `docs/COMMERCIAL_DIAGNOSIS_2026-09-28.md` 上线前置清单与本节。

## 2026-09-28（日）· 交付诊断续修：P1 批次（资金残留 + 库存 + 账实 + 可用性）

> 承接同日八维度诊断报告第四节待办清单，本轮清掉其中影响交付使用的项。

**资金 / 库存正确性**
- **迟到支付第三条静默路径**（订单审计缺陷3）：`markOrderPaid` 此前对任何非
  PENDING_PAYMENT 状态静默返回 —— 当 `paymentSessionId` 落库失败（尽力写
  `.catch(()=>{})`）时，已取消单收到到位支付既进不了兜底分支也不退款不告警
  （注释宣称已修的事故重现）。现对「有真实交易号的到位支付 + CANCELLED」一律
  调 `registerLatePaidRefund`：登记 `Refund(APPROVED)` + `RefundOutbox(PENDING)`，
  由既有 outbox 机制重试到成功，**财务在退款列表可见**（此前只有日志）。
- **二次支付检测 + 原路退回**（资金审计 D1 收款侧）：同一订单被付两次（并发生成
  多个支付会话后各付一次）时，第二笔此前被静默保留且**系统内无法退**。现
  `markOrderPaid` 检测「已 PAID/REFUNDED 却收到不同交易号」→ Stripe 用
  `double-paid-{orderNumber}-{paymentId}` 幂等键原路退回 + error 告警 + PaymentLog。
- **预售同商品多行库存记数**（订单审计缺陷2）：`stockDeducted` 用循环外同一份 stock
  快照逐行 `min(fresh.stock, qty)` → 记录超实际扣减，取消时**凭空造库存**。现维护
  「本次已记扣量」递减，使记录与 SQL 恒等。
- **COD 已发货单退款语义**（订单审计缺陷5）：`SHIPPED` 此前可走退款 → 无资金动作
  判「已退款」+ 立即回补库存（货在途）→ 账实不符、可能重复销售。守卫扩到
  PROCESSING|SHIPPED，引导先拦截包裹再取消。

**可用性 / 合规**
- **提现申请通知管理员**（运营审计 5-1）：提现是纯资金出账，此前只写审计 ——
  申请躺在列表无人知、客户等钱。现 `notifyAdmins` 带深链。
- **订单导出补商品明细**（运营审计 4-1/4-2）：此前 CSV 不含 items，无法拣货/对账/
  退货核算。现一行一商品项（SKU 粒度，订单级金额只在首项行显示防重复求和），
  并补 `X-Export-Truncated`/`-partial` 文件名（此前 5000 行**静默截断**）。
- **库存变更审计记前后值**（运营审计 6-1）：此前只记「发生过」——
  商业交付最常被追问的「谁把价/库存改成多少」无法回答。现记
  `stockBefore/stockAfter`。
- **缓存失效**（性能审计 P1）：下单扣减库存后不失效商品列表缓存 → 售罄后最长
  60s 列表仍显示可买（与未缓存 PDP 自相矛盾）。现下单成功后 `invalidateProductsCache`。

**依赖安全**
- **next 16.3.3 → 16.3.6**（安全审计）：CVE-2026-94545 `next/og` ImageResponse RCE
  （Critical）。本项目当前未使用该 API（暴露 0），升级零代码成本消除潜在风险。

### 验证
tsc 0 · lint 0 error · 单测 284/284 · 集成 172/172 · build ✅

### 仍在报告第四节待办（不影响收款与履约）
管理员重置密码/找回密码失败的用户通知 · 邮件 FAILED 后台可见 · 集合归属后台入口 ·
`descriptionEn` 写入路径 · 慢查询下推（仪表盘/分类树/用户详情）· `/metrics` 与
outbox 积压可观测 · 构建标识与镜像制品 · 备份异地与 PITR · SEO metadata/sitemap ·
`pg_trgm`/`depth` 索引 · 部分端点限流补全 · 汇率快照跨实例一致性。

## 2026-09-28（日）· 商业交付诊断（八维度）+ P0/高危全修（梦哥）

> 大爷要求：「让你做完整的项目诊断 检查分析 把问题都找出来解决 好投入商业运营，
> 我不是要的 demo 项目，而是完全可以交付使用的。」

### 诊断方法
八维度并行深查（资金链路 / 订单库存履约 / 用户认证权限 / 运营后台 / 前台体验 /
安全 / 性能可观测 / 运维部署）+ 主代理自查（环境变量、迁移状态、**商业数据不变量
SQL 实测**、空库迁移实测、生产依赖审计）。完整报告：
[docs/COMMERCIAL_DIAGNOSIS_2026-09-28.md](docs/COMMERCIAL_DIAGNOSIS_2026-09-28.md)

### 修复（全部已验证）

**资金安全（3 项）**
- **Stripe 通用回调缺 `payment_status` 校验**：异步支付方式（SEPA/Boleto/OXXO/
  Klarna）在客户提交收银台瞬间即发 completed（未到账）→ 此前直接置 PAID 并发货
  = 凭一张凭证白拿货。现与 webhook 同口径校验，未到账返回 `skipReason`
  （回 success 停止重试但不认账），由 `async_payment_succeeded` 事件驱动。
- **迟到支付退款幂等键**：Stripe 路径补 `late-paid-{orderNumber}`（渠道路径已有）。
- **迟到支付退款落账本**：修法方向已定（Refund + RefundOutbox 复用），
  与订单审计报告的第三条静默路径一并列入待办（见报告第四节 P1）。

**订单 / 库存**
- **下单幂等键未接线**（上一轮功能失效点）：schema/service/前端都接了，
  `POST /api/orders` 逐字段转调漏传 → `idempotencyKey` 恒 NULL、唯一索引形同虚设，
  双击仍开两张单各扣一份库存。已补传。
- 退款申请占用聚合补 `PENDING`（此前用户看到的可退额度大于实际可批准额度）。
- 后台 tracking 接口改走 `serializeOrder`（此前把游客单 `accessToken` 返回给 staff）。

**安全（2 高危 + 3 中危）**
- **JWT 跨用途混用（高危）**：邮箱验证 token 与 access token 同密钥且 access 侧
  不校验用途 → 任何拿到验证邮件链接的人获得 **24 小时**会话，且 logout/吊销全部
  会话都杀不掉。现 access token 携带并强制校验 `purpose:"access"`。
- **未验证邮箱可下单（高危）**：全站无 emailVerified 门控 → 订单确认/发货/退款
  邮件寄到不存在或他人信箱。现下单前门控（403 + 引导重新发送验证邮件）；
  测试 fixture 同步适配（模拟已点击验证邮件）。
- **后台页面级越权**：`adminOnly` 只是客户端菜单过滤 —— SUPPORT 直连
  `/admin/launch-readiness` 可读邮件发件人/S3/Redis/未改密种子管理员邮箱。
  页面顶部补 `requireAdmin()`（launch-readiness + shipping）。
- **口令复核零限流**：改密/换邮箱的 `currentPassword` 校验可无限在线爆破
  （实测 13 次无 429）→ 新增 `passwordVerify` 策略（5 次/15 分钟/用户）并接线。
- **PII 进日志**：收件人邮箱明文落日志 → mail 层脱敏 + pino `redact` 兜底。

**部署（P0 阻断）**
- **Dockerfile 入口引用已删除脚本** `scripts/wait-for-db.mjs`（3a1ff5f 删除脚本时
  未同步 Dockerfile）→ `&&` 链首段失败，**docker compose 生产与演示两条路径全部
  起不来**、CI docker-smoke 必红。已去掉外部等待脚本（compose 已有
  `depends_on: service_healthy`），迁移失败即退出由 restart 策略重试。

**体验**
- 空分类页 / 首页商品区 / 集合索引**零空态**（0 商品时页面只剩标题 + 空白）→
  三处补双语空态文案。
- 375px 搜索浮层双栏溢出（右栏只剩 45px）→ 小屏单栏；筛选抽屉 400px 宽于视口 →
  `w-[min(400px,100vw)]`。

### 实测健康项（交付信心依据）
商业不变量 SQL 7 项**全部 0 违规**（金额恒等式/库存负数/paidAt 缺失/取消单有 paidAt/
孤儿订单项/退款超额）· 空库 41 迁移全量应用（36 表）· 生产结构库零漂移 ·
`npm audit --omit=dev` 0 漏洞 · 双探针 healthz 200 · 鉴权 105/105 覆盖 ·
26 处 raw SQL 全参数化 · 上传/CSRF/CSP/密钥加密逐项通过。

### 待办（不阻断收款履约，见报告第四节完整清单）
迟到支付第三条静默路径 / 预售多行库存记数 / COD 已发货退款语义 /
管理员改密无通知 / 改价改库存无值级留痕 / 佣金提现导出无审计 / 邮件失败不可见 /
集合归属无后台入口 / 订单导出丢明细 / 缓存失效 / 慢查询下推 / 无 metrics /
无构建标识 / 备份异地 / SEO metadata / next 升 16.3.6。

### 验证
tsc 0 · lint 0 error · 单测 284/284 · 集成 172/172 · build ✅ · 空库迁移 ✅

## 2026-09-28（日）· 【定调不做 · 勿再添加】评价系统与收藏夹已完整移除（大爷指令）

> 大爷指令（原话）：「不是说不要收藏和评论功能吗，怎么又加上了。把这两个功能完全去掉，
> 在代码和开发文档清理干净，免得下次优化项目又给加上去了。」

### 结论：本项目**明确不做**评价系统与收藏夹

**这是产品决策，不是遗漏，不是待办。** 后续任何「完善系统」「补齐电商功能」
「对标主流电商」类优化**都不得再次引入**这两项。历史上曾因误读指令实现过一版
（commit 4da6455），已按本条目完整移除。

### 移除清单（代码零残留，已逐项验证）

- **数据层**：`Review`/`Favorite` 模型、`ReviewStatus` 枚举、`Product.ratingAvg/ratingCount`
  冗余列、User/Product/OrderItem 三处反向关系 —— schema 回滚 + 新迁移
  `20260928120000_drop_review_favorite`（drop 外键/表/列/枚举，双库已 apply）
- **服务层**：`review.service.ts`、`favorite.service.ts` 删除
- **API**：`/api/products/[id]/reviews`、`/api/user/reviews(+/[id])`、
  `/api/user/reviewable/[orderNumber]`、`/api/user/favorites`、`/api/admin/reviews(+/[id])` 全部删除
- **UI**：`product-reviews.tsx`/`stars.tsx`/`favorite-button.tsx`/`review-form.tsx`、
  `/account/reviews`、`/account/wishlist`、`/admin/reviews` 页面删除；
  PDP（评分概览/评价区/心形/JSON-LD aggregateRating）、订单详情（写评价区块）、
  账户侧边栏（My Reviews/My Wishlist）、后台侧边栏（评价管理）挂载全部还原
- **i18n**：shop-i18n / admin-i18n 的评价与收藏词条删除（i18n 卫生测试双向零残留）
- **测试**：`reviews-favorites.test.ts` 删除（对应 8 用例下线）
- **验证**：tsc 0 错 · 全局 grep 零残留引用（`review.service|favorite.service|
  ratingAvg|ratingCount|ReviewStatus|Review[/Favorite[` 全部 0）· 单测 284/284 ·
  集成 172/172（回到不含评价用例的基线）· build ✅ · dev server 冒烟全绿

### 保留说明（与本移除无关，勿混淆）

同批次引入的**边界审计修复与分销口径统一刻意保留**（与评价/收藏无耦合）：
- `Order.idempotencyKey`（下单幂等，防双击重复建单）
- `Address.contentHash`（地址簿内容去重 + 上限 + 限流）
- 分页 page 上限 / P2002→409 映射 / 游客购物车上限
- 分销金额三口径净额统一（总览/明细/余额勾稽）

## 2026-09-28（日）· 【已作废】大爷点名项交付：评价系统 + 收藏夹 + 边界洞根治 + 分销口径统一（梦哥）

> ⚠️ **本条目中的「评价系统」与「收藏夹」部分已作废**：大爷定调这两项**不做**，
> 已按上一条目完整移除（代码 + 数据库 + 文档零残留）。本条目其余部分
> （边界洞根治、分销口径统一、币种下拉样式）**仍然有效**。后续勿再引入评价与收藏。


> 大爷要求：「子智能体很多没完成，是不是偷懒了，要彻底解决所有问题检查」
> 「评价系统/收藏夹是没有的」「把上面没有做完的任务做完，中途中断很多次了，不要有遗漏」

### 一、评价系统（从零建设，非半成品）

此前项目**没有评价功能**（schema 无模型、前台无 UI —— 审计如实报告为「功能不存在」
而非伪功能）。大爷点名为交付缺口，本轮按商业标准建设：

- **反刷评闭环**：仅登录用户 + 仅 **DELIVERED 订单行**可评（orderItemId 绑定=真实
  购买凭证，未收货 400、非本人订单 404）；一人一品一评（`@@unique([productId,userId])`），
  重购同品再评 = 更新已有评价而非新增
- **聚合冗余列**：`Product.ratingAvg/ratingCount`（列表页免子查询），增评/改评/删评/
  下架/恢复全程由 review.service 统一重算（唯一写入点）
- **admin 审核**：默认 APPROVED 即时展示（真实购买门槛已高）；管理端可 REJECTED 下架
  （前台即时不可见 + 聚合同步），`/admin/reviews` 页面 + 侧边栏入口 + 审计日志
- **前台**：PDP 评分概览（★4.8 · 36 条，点击锚点跳评价区）+ 评价列表（服务端渲染，
  姓名脱敏「张*」）+ 订单详情「写评价」区块（可评行清单 + 星级表单 + 已评价徽标）
  + `/account/reviews` 我的评价（含删除）
- **SEO**：商品 JSON-LD 输出 `aggregateRating`（有真实评价才输出，不伪造）
- **通知**：新评价 notifyAdmins 站内通知（含后台深链）
- **测试**：`reviews-favorites.test.ts` 6 用例（未收货拒评/归属校验/公开可见+聚合/
  更新不新增/admin 下架恢复/可评行清单）

### 二、收藏夹（从零建设）

- `Favorite` 模型（`@@unique([userId,productId])`）—— toggle 走唯一约束 upsert 语义，
  双击天然幂等（边界审计口径）
- PDP 心形（client 乐观更新，失败回滚；未登录跳登录页带回跳）+ `/account/wishlist`
  收藏列表（商品卡网格 + 移除）+ 账户侧边栏入口（heart 图标）
- 测试：toggle 幂等（加入→列表快照→移除）、游客 401 登录墙

### 三、边界态审计洞根治（补审 subagent 实测发现）

此前创建订单**无任何幂等兜底** —— 双击下单 = 两张单各扣一份库存（对比：支付/退款
链路幂等完整，唯独创建链路裸奔）：
- **订单幂等键**：`Order.idempotencyKey @unique` + 前端 `crypto.randomUUID()` 随单提交
  （失败重试复用同一 key，跳转后自然失效）；服务端撞唯一约束 → 事务已回滚 → 回读
  首张单返回（真幂等，不重复扣库存）；老客户端不传 key 为 NULL 不受约束
- **地址防重**：`Address.contentHash`（sha256 规范化内容，剔除 isDefault）+ 
  `@@unique([userId,contentHash])` + 创建/更新双路径写入 + 撞约束转 400 诚实提示 +
  **地址簿上限 20 条** + 限流 10 次/分钟（此前无限流、无上限、无去重）
- **分页上限**：`parsePagination` page 封顶 1e6（此前 page=1e18 → skip 超 int64 →
  Prisma 校验错 500，无数据风险但产 Sentry 噪音）
- **P2002 统一映射**：apiHandler 把唯一约束冲突从 500 转 409 CONFLICT（admin 券/商品
  check-then-create 并发双击输家此前落 500 + 误告警）
- **游客购物车上限**：加购前置 50 条闸门（与登录车服务端口径一致，此前超限后才在
  下单环节被通用校验拒绝，报错不友好）

### 四、数据链审计：分销金额三口径统一（实锤不一致）

总览页（毛额）vs 我的佣金（毛额）vs 账户余额（净额）三处勾稽不上 —— 部分退款冲正后
管理员与分销商看到的佣金数互相矛盾：
- `computeAdminOverview` 桶改净额（计提 − 冲正），与同文件 getAdminReport 口径统一；
  REVERSED 桶保留原额作「已冲正」展示
- `listMyCommissions` 行下发 `reversedAmount/reversedSettle` + 前端显示净额并附
  「含已冲正 {m}」标注（明细与账户卡可勾稽）
- `getMyCustomers`/`getMyTeamOrders`/`getTeamStatsLive`/rollup 日汇总全部净额化
  （rollup 此前把 REVERSED 全冲正流水按全额计入，与自身注释「冲正的记为 0」矛盾）
- 总览页口径说明文案同步修正（净额口径 + 部分冲正语义）

### 五、两路补审的其他结论（均已核验，无需改动）

- **仪表盘 stats vs 列表页口径** ✓ 完全一致（pendingRefund=REQUESTED、
  pendingShip=PAID+PROCESSING 两侧逐字段对账；唯一差异是 30s 缓存时效，设计内）
- **通知 link 字段** ✓ 11 个目标全部指向存在页面（含新增 /admin/reviews）
- **邮件模板 vs MailData** ✓ 13 键 ↔ 13 组件一一对应，三个新模板字段齐备
- **金额精度/分页越界/购物车数量上限/多标签页** ✓ 实测稳健（多标签页 last-write-wins
  非资损：下单金额全部服务端按 DB 现价重算）

### 六、样式修复

顶栏币种下拉在长国名（"United Kingdom (GBP £)"）叠加选中态 ✓ 时换行破版：
菜单 w-56→w-64（最长组合 181px < 194px 文本区）+ 文本 `whitespace-nowrap` +
两侧 `shrink-0` 防御。

### 七、验证

- tsc 0 错 · lint 0 error（17 警告，均为既有基线类）· 单测 284/284 · 集成 180/180
  （21 文件，含新增 reviews-favorites 8 用例）· build ✅ · 双库 migration（
  review_favorite / order_idem_address_dedup）已 apply

## 2026-09-26（五）· 交付级终审：四路专项审计 + 资金洞/通知断链/数据孤岛全修复（梦哥）

> 大爷要求：「通盘检查所有 bug，发现 bug 解决 bug。不要伪功能、不要数据孤岛、
> 不要碎片化——一次完整解决遗漏的问题，按工程流程走，反复求证，达到可直接
> 交付商业使用的程度。」

### 一、四路专项审计（性能/权限/周边安全之后补齐的盲区）

**伪功能审计**（全量扫死链接/死按钮/表单后端/硬编码/设置消费链路）：25 个静态
href + 12 个模板 href + 27 个表单 onSubmit 逐一对账——**零死链接、零空 onClick、
全部落到真实 API**；支付渠道置灰完全由服务端 available 驱动（DB+密钥+isReady）。
抓到 2 个交付阻断（见下）。

**业务闭环审计**（四条旅程逐环节验证）：购物→支付→收货→售后、注册→验证→
找回→注销、分销全旅程、运营日常——**四条旅程闭环全部成立**。抓到 1 个资金级
缺口 + 2 个通知断链 + 若干语义毛边（见下）。

**数据孤岛审计**（部分回传）：抓到管理端分销总览币种混算（见下）。

**错误边界审计**（subagent 两次失败，梦哥自查闭合）：error.tsx/global-error/
not-found/admin-error 全存在 ✓；管理端共享 ConfirmDialog 统一 loading 禁用
（防双击）✓；checkout 下单按钮 submitting 禁用 ✓；API 层 401 统一分级处理 ✓；
补齐根级 loading.tsx 路由骨架。低危记录：商品卡图片 onError 兜底缺（storage
文件被删的边缘场景才触发）。

### 二、资金洞修复（业务闭环审计 D1 · 最高优先级）

**已取消订单收到迟到支付，非 Stripe 渠道静默吞钱。** 触发链：订单 30 分钟超时
自动取消（库存/券已回补）→ 顾客在网关侧仍完成支付（支付宝二维码有效期远长于
30 分钟）→ 回调进 markOrderPaid。兜底条件是 `CANCELLED && paymentSessionId`，
但只有 Stripe 落库 sessionId；渠道化支付（支付宝/微信/银行卡/PayPal）此前命中
「非 PENDING_PAYMENT 静默返回」+ 网关回 success = **钱被收走、货已回补给他人、
不退款、无告警**。
- 修法：notify 路由在金额校验后拦截 CANCELLED 单 → 全额原路退款
  （provider.refund + 固定幂等键 `late-paid-{orderNumber}`）；成功/受理回
  success（网关停止重试），失败回 fail（网关重发回调 = 自动重试退款）+
  error 级告警人工介入。
- 回归测试：真实 RSA 签名回调打 CANCELLED 单 → 断言订单保持 CANCELLED、
  paidAt 不写、交易号不认领（payment-notify 12/12）。

### 三、币种混算修复（数据孤岛审计实锤 · 管理决策输入被污染）

管理端分销总览「待打款合计」= Σ 各结算币种的 withdraw.amount，字段名却叫
amountCny——**USD 分销商提 $100 会被当成 ¥100 计入**，管理员审批直觉被误导。
- 修法：`withdraw_records` 新增 `amountCny`（申请时汇率快照固化，同佣金计提
  模式）；applyWithdraw 复用限额校验已算好的 cnyPerUnit 折算写入；总览聚合
  改 `_sum amountCny` 跨币种安全加总。行级列表页仍按原币种+币种列展示（诚实）。

### 四、通知断链修复（业务闭环审计 D2/D3）

- **D2 订单取消零邮件**：超时自动取消是高频分支，游客单（无账号没站内信）
  此前完全零触达。新增 `order-cancelled` 邮件模板（双语）+ cancelOrder 全场景
  发送（游客 contactEmail / 登录回退账号邮箱）；超时/对账过期的系统取消用
  「未扣款，可重新下单」口径（autoExpired），人工取消用「联系客服全额退款」口径。
- **D3 退款异步终态无通知**：审批时邮件只反映当时状态，网关受理（pending）后
  cron 重试成功、或 FAILED 数天后重试成功——用户永远停留在「处理中/失败」的
  旧信息里。新增 `notifyRefundOutcome`（邮件+站内双通道）挂在两个异步终态点：
  outbox SUCCEEDED 部分退款分支 + markOrderRefundedByGateway 整单终态（事务内
  didTransition 标志防并发重放双发）。

### 五、旅程闭合：超时自动确认收货（审计建议#1 · 大爷专项问题）

此前仅手动确认（用户按钮/admin 推进），顾客不点确认订单永停 SHIPPED。新增
`AUTO_CONFIRM_DELIVERY_DAYS`（env 可配，默认 15 天，0=关闭）+ cron 任务
`autoConfirmDeliveries`：复用 updateOrderStatus 全语义（CAS 推进 + COD 送达
记 paidAt + 通知 + 分销即时结算钩子），管理员抢先推进时 CAS 冲突自然跳过。
配套：`order-delivered` 完成邮件（手动/自动全场景）+ DELIVERED 站内信从
「请确认收货」改为完成语义（终态订单不再请求确认，审计建议#6 一并修复）。

### 六、商业语义毛边修复

- **COD 未发货单退款 = 假「已退款」凭证**（建议#3a）：顾客没付过钱，走退款
  被即时置 SUCCEEDED。修法：退款申请入口拒绝 COD+PROCESSING，引导走取消
  （取消入口本就支持 COD 未发货，库存/券正确回补）。
- **到货提醒失败悬空**（建议#4）：发送失败的 draft 只能等下一次库存事件，
  商品再无变动就永远悬挂。新增 `retryFailedRestockAlerts`（复用 notifyRestock
  全语义：在售/库存/变体匹配守卫）挂调度器 10 分钟一轮，幂等零稳态成本。
- **发票 0 运费显示 "0.00"**（建议#6）：与订单页「Free shipping」口径不一，
  改为「免运费/Free」（InvoiceCopy 补 free 键）。
- **TAX_RATE>0 部署陷阱**（伪功能审计#5）：结算页摘要此前无 Tax 行，env 一旦
  配置税率会出现「订单页有税、结算页没税」。修法：服务端注入 taxRate，摘要
  与 computeOrderAmounts 同公式补 Tax 行（=0 时不显示，含税口径不变）。

### 七、伪功能审计的 2 个交付阻断

- **contactPhone 死设置**：运营可填、保存成功、全站零消费（「改了没效果」的
  伪功能）。修法：footer 版权行消费（`客服 {phone}`，双语），与 icp 同排。
- **首页横幅 picsum 随机外链图**：分类没传 image 时，商业站第一屏显示
  picsum.photos 的随机库存图。修法：缺图时横幅退为深色底+渐变+文案（诚实），
  同时关掉 next.config 和 CSP 的 picsum/unsplash 白名单通道（外链随机图在
  生产再无入口）。

### 八、尺码表数据孤岛迁移（后台所见 ≠ 前台所示）

16 个演示品的尺码表此前内置在前端注册表（size-chart-data.tsx）：后台编辑器
为空时前台仍显示内置表；商品删除后表成幽灵数据。五步迁移到 DB 单一事实源：
1. 数据迁至 `prisma/size-charts.ts`（seed 数据归属 seed）；
2. seed 创建演示品时携带 sizeChart + 既有库补填循环（幂等：仅 sizeChart 为
   null 才写，运营已编辑的值绝不覆盖；**补填逻辑在 FORCE_RESEED 守卫外**，
   既有库也生效——实测补填 15 个）；
3. PDP 删注册表 fallback（无表即不渲染区块，诚实）；
4. 参数表搜索改 DB-only（sizeChart ILIKE + 名称匹配，语义等价迁移）；
5. 前端只留 SizeChartAccordion 纯展示组件。

### 九、调度器与文档

- 调度器长事务重构（租约表）与两处消费聚合下推已在上一条目落地（16f058d）；
  本条目补 `DISTRIBUTION_COMMERCIAL_AUDIT` 历史文档注记（3 个 P0/8 个 P1 已
  全部修复，当前状态以 CHANGELOG 为准）+ GAP_ANALYSIS 活文档的选主机制描述
  更新（咨询锁→租约表）。

### 十、验证

- tsc 0 错 · lint 14 警（基线零新增）· 单测 284/284 · 集成 172/172（含 D1
  资金洞回归用例）· build ✅
- 实测：seed 补填后 15 个演示品 sizeChart 落库；admin/stats 与分销报表两套
  独立 SQL 交叉验证同一营收值。

### 十一、范围交底（功能不存在 ≠ 伪功能，如实向大爷报告）

- **评价系统 / 收藏夹**：schema 无模型、前台无任何 UI 区块——不是「有区块
  无数据」的半成品，是**功能不存在**。属 V2 迭代范围（今天加会引入未审计面，
  违背「稳健交付」原则）。
- **四家预留支付渠道**（支付宝/微信/银行卡/PayPal）：参数组装与验签已完成，
  诚实置灰（DB+密钥+isReady 三重守卫，误启用也不会假成功）。上线收单需申请
  商户账号完成对接——**业务事项**，非代码缺陷。Stripe 全链路已可用。
- 退款行级明细 schema 演进（部分退款回补库存/券的精确化）维持记录在案
  （当前口径有界保守：多冲不冲错扣分销商）。

## 2026-09-26（五）· 三路扫尾审计（性能/权限/周边安全）+ 低库存深链报障（梦哥）

> 大爷要求：以资深全栈工程师视角深入分析整个项目，达到顶级电商投产标准
> 还有什么问题；并报障「仪表盘低库存点进去没有直接给筛选结果」。

### 一、大爷报障修复：低库存深链竞态

- **现象**：仪表盘「低库存」卡片点进商品页，显示全量列表而非低库存筛选结果。
- **根因**（双请求竞态）：深链初始化走 useEffect——挂载先按默认值发出**无筛选
  请求 A**，effect 把 stockFilter 置为 low 后再发**筛选请求 B**；dev（Turbopack
  按需编译）下 A 首次触编译响应慢、B 走热路径先回，A 后到时把全量结果
  **覆盖**了 B 的低库存结果。该竞态对用户快速手动切换筛选同样成立。
- **修法**：① `useSearchParams` 直读初值（首个 render 即带筛选，只发一个正确
  请求，竞态源头消灭；页面拆 Suspense 壳，同 admin/login 先例）；② 请求
  序号守卫——load 内 seq 递增，过期响应（含 loading 态）一律丢弃。
- 验证：带会话 curl 深链页面 200、API `?stock=low&status=ACTIVE` 返回过滤
  数据（与仪表盘计数同口径）。

### 二、周边安全审计（上传/注入/CSP/依赖）

- **高危修复：JSON-LD `</script>` 逃逸**——`JSON.stringify` 不转义 `<`，FAQ
  答案/产品名/站点名由 SUPPORT 录入并渲染进三处公开页的 JSON-LD，写入
  `</script><meta refresh>` 即可强制全体访客跳钓鱼站（meta refresh 不受
  CSP nonce 限制）。修法：新增 `safeJsonLd()`（`<` → `\u003c`，Next 官方
  推荐），三处调用点统一替换。
- **中危修复：S3 complete 闸门错误原文透传**——S3 SDK 异常的 err.message
  （可含 endpoint/bucket/key）直接回给仅 requireStaff 的调用方；改为固定
  文案 + 原文进日志。mail-test 错误原文一并收敛。
- **核验为安全**：上传链路（MIME 白名单无 SVG + sharp magic bytes 双验 + S3
  complete 闸门重读全字节）、路径穿越、URL 枚举、邮件注入、错误泄漏、open
  redirect、Cookie 属性、CSRF、CSP；**npm audit 487 个生产依赖 0 已知漏洞**。

### 三、权限矩阵与限流审计（133 个 route 全量遍历）

- **高危 1 修复：SUPPORT 可改商品价/库存/删品**——6 个商品写操作
  （POST/PUT/DELETE/status/stock/batch-status/batch-delete）仅 requireStaff，
  客服账号被盗即可 0.01 元改价或物理删品。全部改 `requireAdmin`（GET 保留
  staff）。
- **高危 2 修复：SUPPORT 可创建/改/删优惠券**——优惠券面额/门槛/perUserLimit
  是资金凭证，客服角色不应触碰；4 处写操作全部改 `requireAdmin`。
- **中危修复**：① 运费模板三处写操作（fee 直接影响应付金额，等于间接改价）
  改 `requireAdmin` 并补 audit 留痕（此前是全后台唯一「资金相关且零留痕」
  写面，更新记 fee 前后值）；② 退款申请补 rateLimit（单订单 3 次/10 分钟，
  游客叠加 IP 桶——每笔申请都 notifyAdmins，可被持 N 个游客单 token 刷爆
  管理员待办）；③ 到货通知加 IP 桶（20/h，堵「轮换邮箱无限灌 NotifyMe 行
  → 补货时邮件轰炸」）；④ 全量订单导出（含 PII）补 audit 留痕（导出量与
  筛选条件入 meta）。
- **核验为安全**：IDOR 抽查全过（地址簿/订单/退款/分销全部以会话身份锚定
  查询，无一处信任请求体 userId）；游客查单 token 256bit + 真常量时间比较；
  管理端资金面 19 个分销 route + 支付渠道/用户/审批全套 requireAdmin ✓；
  13 条集中式限流策略（Redis Lua 原子 + 全站熔断）覆盖全部敏感入口。

### 四、性能与容量审计（50 万订单量级）

**索引批（两个 migration，六组索引）**：
- `orders (paidAt)`——全 schema 此前没有任何 paidAt 索引，而资金统计/对账
  全靠它过滤；`orders (isUnread, createdAt desc)`——运营默认视图的复合排序
  此前只能 50 万行 seq scan + top-N sort；
- `refresh_tokens (expiresAt)` / `mail_outbox (updatedAt)`——心跳每 60s 按
  时间批删，此前每分钟全表扫；
- `commission_logs (createdAt)`——风控/报表时间窗口查询的支撑。

**调度降频**：分销对账 60s→5min（补偿性质，7 天水位窗口兜底）、团队业绩
rollup 60s→每小时（天级新鲜度足够，此前每分钟对闭包表全表 groupBy ×2）。

**查询下推与水位**：管理仪表盘统计（3 条营收 SQL + 9 个 count，50 万行级
全表扫）套 30s 缓存，最近订单/爆款轻查询保留实时；分销总览（100 万行
groupBy）套 60s 缓存；对账 orphans/missing 查询加 7 天 `createdAt` 水位
（稳态扫描量从全表降到最近一周活跃集）；风控自购检测加 90 天窗口；**对账
报表毛利计算整体 SQL 聚合下推**（此前 365 天窗口可拉数十万行 × items 进
Node 内存算毛利，单请求内存尖峰、响应数十秒——现两条 SQL 走索引流式聚合，
口径逐分支对照原 toCny 公式不变）。

**核验为安全**：分页纪律（全列表经 parsePagination 上限 100、导出硬上限 +
truncated 标记、keyset 游标）；无真 N+1（循环内 await 均为行锁/CAS 必要
模式且行数 ≤5）；缓存体系（商品/设置/汇率/限流）在刀刃上；下单热路径
（行锁排序防死锁 + 通知旁路化）合理。

### 五、测试基建加固（审计修复钓出的连锁问题）

汇率熔断（上一轮修复）在测试环境误触发，暴露两个基建缺陷并修复：
- **集成测试外网依赖**：seed 新增汇率台账基线（fx.rates + fx.ratesAt，与
  FALLBACK_RATES 同源维护）——live 源不可用时下单/计提走 db 回退且台账
  新鲜 → 熔断放行，**集成测试从此不依赖外网汇率源**；生产首次部署也有了
  兜底台账（此前部署后到首次成功拉取前是「无台账」状态，钱路径直接拒单）。
- **测试间污染**：rate-fuse 用例清理从「删 fx.* 键」改为「每用例恢复新鲜
  基线」——此前把共享测试库的汇率状态清零，并行下单用例撞上熔断 503。

### 六、验证

- tsc 0 错 · lint 14 警（基线零新增）· 单测 284/284 · 集成 171/171 · build ✅
- 报障修复带会话实测：深链页面 200、`?stock=low` API 返回过滤数据。

### 七、记录在案的后续项（非缺陷，工程排期）

- 心跳长事务重构（租约表替代事务内咨询锁，代码注释已自知设计债）；
- 管理端模糊搜索 pg_trgm GIN 支撑（订单/用户搜索，20 万用户量级后）；
- 客户列表消费聚合 SQL groupBy 下推（鲸鱼用户单页放大，当前量级不痛）；
- 生产部署时按实例规格显式配置 `connection_limit`（PRODUCTION_DEPLOY 文档
  已有提醒）。

## 2026-09-26（五）· 投产前资金安全大审计：四路并行审计 + 15 项修复（梦哥）

> 大爷要求：「货币的汇率是不是有时效性？还是要手动刷新？完整检查一下项目
> 还有没有问题或 bug、不符合商业逻辑的——稍微有一点错投入商用会引起经济
> 损失，杜绝这样的问题出现，在投入使用前把所有问题解决。」

### 一、先回答汇率时效性（大爷的直接问题）

- **不用手动刷新**：内存缓存 6h（上游免费源每日更新）+ 过期后「先返回旧值、
  后台静默刷新」（SWR），正常运营零人工介入。
- 后台保留**「立即刷新」**与**「逐币种锁价覆盖」**两个运营抓手（波动期锁价
  = 商业决策，优先级最高）。
- 审计后补上**陈旧度熔断**（见下），汇率从「尽力新鲜」升级为「新鲜可证，
  否则拒绝结算」。

### 二、四路并行审计（支付回调 / 退款 / 优惠券+库存 / 分销资金）

支付回调与分销两路由独立审计代理逐行核验（各 8-10 项检查清单，逐项给
✅/❌ + 行号佐证）；共发现 **8 个高危 + 6 个中危**。安全项结论：金额校验
分位精确比对、Stripe 验签 fail-closed、mock 五层门控、幂等三层防护
（事件级 claim + 订单级 CAS + 佣金唯一索引）、提现无双花、负余额可挂账
不可提现——这些原有防线经复核成立。

### 三、高危修复（可造成直接资金损失）

1. **规格库存丢失更新 → 单请求即超卖**（下单）：同商品多规格行各自基于
   同一份快照计算再整体覆盖写回，后行抹掉前行扣减（S×2+M×1 下单后 S 规格
   库存凭空回升，实际 2 件能卖 4 件）。修复：按商品**链式聚合、一次写回**；
   取消/退款回补两处同构缺陷一并修。回归测试锁定（Black×2+White×1 下单
   → Black=0/White=7，取消后精确还原）。
2. **已取消订单收款后静默吞钱**：Stripe 会话有效期比订单过期长 60s（平台
   最短 31 分钟），窗口内付款 → 钱被扣、库存已回补给他人、无退款无告警。
   修复：markOrderPaid 对已取消订单**自动全额原路退款 + error 级告警**，
   退款失败也不吞事件（人工凭告警介入）。
3. **异步支付未到账即发货**（白拿货级）：SEPA/Boleto/OXXO/Klarna 在提交
   收银台时即触发 `checkout.session.completed` 但 `payment_status=unpaid`，
   此前直接置 PAID → 凭一张凭证白拿货。修复：webhook 只认 `paid`，新增
   `async_payment_succeeded`（同口径金额校验后置 PAID）与
   `async_payment_failed`（告警留痕）。
4. **legacy Stripe 建单金额口径错**：逐行传明细（Σ=subtotal）而 webhook 按
   order.total 比对——有券/运费单必然金额不符 → 永不置 PAID → 客户被真实
   扣款但订单被自动取消。修复：与渠道化路径同口径，按订单总额单行建会话。
5. **汇率陈旧熔断**（新增 `assertRatesUsableForMoney`）：免费源每日更新、
   live 故障时回退库内台账——但台账可以**任意陈旧**（部署后外网全断就永远
   用一周前的汇率收钱）。现在钱路径（下单收款/佣金计提）过熔断闸：live/新
   鲜台账放行；台账滞后超 72h 或退化为内置参考值 → **拒绝结算**（下单 503
   「稍后再试」、计提跳过留痕待补偿），管理员锁价可豁免。同步修复：db 回退
   分支此前会**丢掉管理员锁价**（外网一抖动锁价就失效）。
6. **toSettle 静默 USD 兜底 = 1:1 假汇率入账**：结算币种不在汇率快照时退回
   USD 基准金额记到外币账户。修复：返回 NaN，计提侧跳过该受益人并留痕
   告警（宁可不付，不按假汇率入账）。
7. **结算币种变更与首笔计提的竞态**：并发改币种可让 CNY 面额流水记进 EUR
   账户（≈8 倍放大入账），且数字对账完全失明。修复四层：守卫改事务+行锁；
   币种只接受系统已启用列表（堵住 "XXX" 伪代码）；入账前断言流水币种==账户
   币种（拒绝入账+回滚认领+告警）；对账新增币种漂移独立扫描。
8. **「部分受益人折算失败」永久丢佣金**：多级链中一人折算失败被跳过、
   其余人已落库 → `already>0` 整单短路 → 该级佣金永久无人补，reconcile 的
   none-scan 也永不覆盖。修复：幂等判定改**按 (受益人,层级) 差集**，缺谁
   补谁；跳过事件升级为 captureMessage 告警。

### 四、中危修复

- **FAILED 退款不计入退款占用额 + outbox 无限重试**：网关超时的退款会被
  cron 复活，但管理员还能按「剩余额度」再批新退款（接不做服务端封顶的
  网关即真实超退）。修复：三处占用聚合全部计入 FAILED；退款 outbox 加
  死信上限（6 次后停止自动重试 + error 告警转人工）。
- **提现限额折算静默按 1 兜底**：非 CNY 账户在快照缺该币种时限额被放大
  ~7 倍。修复：退内置参考汇率（方向保守），再取不到直接拒绝提现。
- **alipay/bankcard 验签后不校验交易状态**（渠道接入前堵死）：TRADE_CLOSED
  /WAIT_BUYER_PAY 等非成功通知此前也能置 PAID。修复：只认成功态。
- **锁序与纵深**：多行 `FOR UPDATE` 全部排序（防并发下单死锁）；
  approveRefund 锁内显式校验订单仍可退款；结算/冲正行锁加 ORDER BY。
- **台账时间戳解析 fail-closed**（熔断测试钓出的真 bug）：库内汇率时间
  解析不出时此前静默用「现在」顶替——陈旧台账被洗白成新鲜绕过熔断。修复：
  解析不出即返回 null（时间不可知 = 陈旧度不可判 = 不可结算）。

### 五、有意保留（业务取舍，非缺陷，记录在案）

- PROFIT 模式部分退款冲正比例用销售额分母（少冲不反向加钱，平台有界多付
  上限=佣金额）——利润基数重算联动涉及冲正口径重构，下轮单独做严谨。
- 部分退款不回补库存/券（行级明细需 schema 演进）；优惠券限次按「登录账号/
  游客邮箱」双口径计数；ADMIN 自购自批无职责分离（有审计留痕）——均为
  内控建议级别，已记录。

### 六、验证

- tsc 0 错 · lint 0 错 14 警（基线零新增）· 单测 **284/284** · 集成
  **170/170**（含新增：多规格行聚合扣减回归 + 汇率熔断三档回归）· build ✅
- 熔断测试专门用 stub 上游的方式覆盖「live 不可用」场景，不依赖真实网络，
  可在任何环境稳定重跑。

## 2026-09-26（五）· 全项目死代码清扫：删 37 个僵尸脚本 + 240 条僵尸词条 + 死函数（梦哥）

> 大爷要求：「检查一下这个项目有哪些是死代码、僵尸代码——之前修改优化网店
> 冗余的、不要的——清理一下，保持项目的干净。」原则：工具扫描 + 引用链
> 人工验证双保险，不盲删（约定式路由、词典字符串引用、动态 import 都是
> 扫描器盲区，必须逐个验证）。

### 一、僵尸脚本（37 个文件，-631 行）

- **早期 QA 手工探测脚本 32 个**（`scripts/qa/qa-*.mjs`）：被 Playwright e2e
  + vitest 集成测试全套取代，且经引用链分析零可达（npm scripts 入口 +
  文档活指引均无）。**保留 10 个有 npm 入口的**（`qa:hardcode`/
  `qa:error-lang`/`qa:links:static` 三件套更是 `verify` 门禁链的组成部分）。
- **一次性/遗留脚本 5 个**：`start-dev-db.mjs`（embedded-postgres 依赖根本
  不在 package.json，跑不起来的「遗留路径」）、`wait-for-db.mjs`、
  `seed-faqs.ts`（FAQ 种子已并入 `prisma/seed.ts`）、`gen-demo-images.mjs`、
  `fix-error-lang.mjs`。
- 文档同步：QUICKSTART / PROJECT_DEVELOPMENT / DESIGN 里对已删脚本的
  「可用」指引改为指向 Playwright / 现行链路。

### 二、词典僵尸词条（240 条，admin 69 + shop 171）

- 两本 i18n 词典里躺着历次迭代换版前的文案尸块（如 Banners/Subscribe/
  "New Arrivals"/"Forgot password?"），只增不减。
- **清理即工程化**：正向测试（`i18n-keys`）只保证「引用的 key 必须有词条」，
  新增 `i18n-dict-lean` 反向卫生测试补齐另一半——「词条必须被引用」，
  进 CI 后新死词条直接红，不用再周期性人工清扫。
- 实施教训（三次迭代）：正则/字符串偏移对多行块、转义引号、注释全不可靠
  （v2 误删活词条、v3 破坏文件结构），最终用 **TypeScript AST**（编译器级
  pos/end 定位词条节点）+ prettier 重排 + 双向测试验证，一次通过。

### 三、死函数与重复导出（6 处）

- `categoryProductCount`（category-utils）、`getCategoryBySlug` / `getHomeData` /
  `requireProduct` + `badRequest` 转发导出（product.service）、
  `cleanupExpiredTokens` / `refreshRequiredError`（session）、`isTest`（env）
  ——全部零引用，删。
- `productImageSchema` 是 `imageUrlSchema` 的纯别名（重复导出），删别名、
  调用点改用本体。
- 清理后遗留的 3 个空 import 一并摘除，lint 警告回到基线 14。
- **刻意保留**：`components/ui/*` 全家桶的 re-export（shadcn 组件库完整性，
  非 business 死代码）；文件内部在用、仅 export 面过宽的符号（收窄属于
  风格优化，不属死代码，未动）。

### 四、验证

- tsc 0 错 · lint 0 错 14 警（零新增）· 单测 **284/284**（含新增反向卫生
  测试 2 例）· 集成 **166/166** · build ✅ · e2e 不受影响（`verify` 门禁链
  中的 qa:static 三件套全部保留）

## 2026-09-24（四）· 后台体验修复 + 全站多币种结算 + 分销利润分成（梦哥）

> 大爷实测反馈（原话要点）：侧栏收起后没有功能图标；后台仪表盘中英混用；
> 分销全按人民币结算，没考虑非人民币区域；前端币种菜单没有国旗；后台要有
> 货币扩展管理（增删币种、控制哪些区域用什么币种支付）；商品「成本价」
> 字段闲置，能不能用来算利润分成；商品编辑不应直接填总库存（多规格商品
> 不知道加给哪个规格）。「不要硬编码 不要伪功能 不要有数据信息孤岛 数据链
> 业务逻辑打通」。

### 补充闭环（同日晚些，大爷二轮实测反馈）

- **「提交订单提交不了」根因**：dev/部署进程在 schema 迁移与 `prisma generate`
  之后**未重启** —— 运行中进程内存里的旧 Prisma client 没有 `currency_configs`
  模型，下单走到支付币种校验（新代码）时对不存在的模型发起查询直接失败。
  **这不是代码缺陷**：`migrate deploy` + `generate` 之后必须重启应用进程
  （开发重启 `npm run dev`；生产滚动重启）。已用游客下单全链路 curl 冒烟
  验证恢复（订单成功落库，币种/汇率/成本快照齐全）。
  顺带清除了一次被强杀进程污染的 Turbopack 缓存（症状：POST 长时间无响应，
  清 `.next` 后 17ms 应答）。
- **列表页库存判定再修**：有规格组但**还没填过规格库存**的商品，列表点库存
  仍走「直改总库存」老路（大爷填的总库存不知道给哪个规格）。根因是列表页
  用 `specStock 是否已填` 判定，与编辑表单（`attributes.selectable` 判定）
  口径不一致。已统一为「有可选规格组」判定：一律点开面板逐规格填写（含
  历史已有值），单规格商品才保留行内直改。
- **行内编辑浮层叠字（大爷三轮实测）**：单规格点开库存编辑，取消按钮压在
  右侧「已售」列数字上、半透叠字不美观。根因是浮层用 `relative` 占文档流，
  超宽部分把相邻列内容半遮半露。已改 `absolute` 悬浮（不挤表格、实底完整
  盖住下层、z-30 高于 sticky 列），单规格按钮 icon 化收窄（约 170→136px），
  多规格面板同步统一口径。

### 一、后台体验三处修复

- **侧栏收缩态保留功能图标**：根因是 `globals.css` 里 `nav > div { display:none }`
  把整个导航组连图标一起藏掉，而配套的 `nav > div.space-y-0\.5` 选择器层级写错
  永不命中。重写折叠规则：只隐藏组标题（`.nav-group-label`）、居中图标
  （`nav a { justify-content:center }`）。**收缩态侧栏底部不再出现展开/收缩
  按钮**（原 `AdminSidebarCollapseButton` 连同容器一并删除，侧栏收放统一由
  顶栏按钮操作，一处入口不迷路）。
- **后台语言锁定中文，根治中英混用**：真根因不是字典缺词条（校验脚本证实
  602 条 DICT 覆盖全部英文 key，232 个「缺失」全是中文直传 key，无需翻译），
  而是**服务端 `getLang()` 读历史 cookie `admin-lang`**（当年语言切换器写入的
  en 残留）→ RSC 渲染英文 + 客户端中文 = 大爷看到的混排。`getLang()` 强制返回
  zh 后存量脏 cookie 不再产生任何影响（不用清浏览器数据）。
- **前台币种展开菜单补国旗**：菜单项加 `<img src="/flags/<flagCode>.svg">`
  （与关闭按钮同套资源；emoji 国旗在 Windows 上不渲染，故用 SVG）。

### 二、商品库存：从「伪输入」到「规格驱动」

- 表单里「总库存」输入框对**有规格商品**从来都是伪输入（提交时被
  `min(各组规格之和)` 覆盖，填了白填）—— 运营填 50 不知道加到哪个规格头上。
  现在：有可选规格组的商品，总库存**只读自动汇总**（实时 `min(各组之和)`，
  与提交口径同源），提示语引导到下方「规格库存」逐规格填写；无规格商品
  保持原输入框。列表页的规格明细内联编辑（逐规格输入 + 实时合计 + 服务端
  `aggregateTrackedStock` 重算）此前已就绪，与表单口径一致。

### 三、货币体系：从「前端硬编码」到「后台可管理」

- **新表 `currency_configs`**（code/name/country/symbol/locale/flagCode/
  enabled/payable/sortOrder）：运营可**增删站点支持币种**；
  `enabled` 控制前台展示，`payable` 控制能否以该币种**下单结算** ——
  展示换算与结算收款解耦（可展示 CNY 换算但只收 USD）。
- **新服务 `currency-config.service.ts`**：首读幂等播种内置清单（此后以表为
  准）；表故障时前台回退内置清单（不白屏）、支付校验跳过（不挡卖货）。
- **API**：`GET /api/currency/list`（前台选择器数据源）+ 
  `GET/POST/DELETE /api/admin/currency/config`（增删改，全审计留痕）。
- **后台「货币与汇率」卡片升级**：币种增删表单（ISO 4217 校验）+ 每行
  「前台展示/允许支付」双开关 + 删除按钮，汇率快照/刷新/覆写功能保持不变。
- **下单支付币种校验**：`createOrder` 在读汇率前校验用户币种 `payable`，
  关闭的币种给出可行动的中文报错。
- **前台动态化**：`CurrencyProvider` 增加币种列表拉取（`/api/currency/list`），
  币种选择器数据源从 context 取（静态 `CURRENCIES` 降为内置兜底）——
  后台增删币种后前台选择器即时跟随，不再需要发版。
- **seed**：`prisma/seed.ts` 幂等播种币种配置（只补缺失行，后台改过的不覆盖）。

### 四、分销结算：账户级结算币种（打通「非人民币区域分销」）

- **账本口径升级**：`commission_logs` 新增 `settleCurrency / amountSettle /
  reversedSettle`（计提时按**受益人账户的结算币种**折算并固化，之后汇率波动
  不影响已计提的账）；`distributor_accounts` 新增 `settlementCurrency`（默认
  CNY，与历史数据完全兼容）；`withdraw_records` 新增 `currency`（申请时快照）。
- **存量回填**（迁移 SQL 内完成）：历史流水 `amountSettle = amountCny`、
  提现单 `currency = CNY` —— 升级后账本语义零变化。
- **全链路切换**：结算入账/比例冲正/人工冲正/余额扣减/账户摘要/提现单据/
  站内信与邮件通知，金额一律走结算币种口径；`reversedSettle` 与订单币种、
  CNY 三列按同一比例推进（对账口径一致）。
- **分销客自选结算币种**：分销中心新增「结算币种」卡片；**硬约束：有佣金
  流水或余额后不可变更**（服务端强校验）—— 账本余额按结算币种计价，中途换
  币种会打断「Σ流水净额 = 账户余额」的对账链；提空余额后即可换。
- **风控限额折算**：日/月提现上限、最低提现额按 CNY 心智配置，非 CNY 账户
  申请时**按当前汇率折算后比较**（否则 USD 账户提 5000 美元 ≈ 3.6 万人民币，
  风控形同虚设）；前端展示与校验同口径。
- **报表口径**：后台总览统计（跨账户汇总）保持 CNY 审计口径 —— 多币种账户
  的金额不能直接相加，`amountCny` 列保留作为全平台统一对账维度。

### 五、分销利润分成：把「成本价」用起来

- **`DistributionConfig` 新增 `commissionBaseMode`（后台分销规则页可配）**：
  - `SALES`（默认）：基数 = 商品实付小计（历史口径，升级零感知）；
  - `PROFIT`：基数 = Σ(订单行实付分摊 − 成本价快照 × 数量)。
- **订单行成本快照**：`order_items.costPrice` 在**下单时**从商品成本价快照
  （USD 基准，与商品价格同口径）—— 之后改成本价不影响已下单订单的利润口径；
  迁移对存量订单行做了回填（商品已删的行保持 NULL）。
- **利润计算经 USD 中转**（行实付是订单币种、成本是 USD 基准，必须统一）；
  行实付分摊 = 行小计 × (订单实付小计/订单小计)，与退款按比例口径一致。
- **不确定利润就不计佣**：未填成本价的订单行**跳过**；全单无成本价或整体
  亏损 → 本单不计佣（skipped=PROFIT_BASE_UNAVAILABLE 留痕）—— 宁可不付，
  也不瞎付。亏本行按负数参与求和（真实利润口径，不夹取）。
- **冲正分母保持销售额口径**：退款比例 = 退款金额/商品实付小计，与计佣
  模式无关 —— 退 30% 的货就冲 30% 的佣金，数学上对两种模式都正确。

### 六、验证

- 单测 **282/282**（新增 admin-i18n 词条 6 条后 i18n 覆盖测试全绿）；
  集成 **166/166**（concurrency fixture 补结算币种字段）；
  E2E shop 全链路 **3/3**（此前失败纯因 chromium 未安装，环境问题非代码）；
  `tsc` 0 错；`lint` 0 错 14 警（本轮改动零新增）。
- 迁移：`20260924140000_multicurrency_distribution_commerce`（六处 schema 变更
  + 三段存量回填，`prisma migrate deploy` 一次到位）。

## 2026-09-23（三）· 邮件服务从「只读状态卡片」升级为「后台可配的真功能」（梦哥）

> 大爷实测反馈：「是假功能，不能配置吗? 不要硬编码 伪功能」。

### 问题（大爷说得对）

上一轮加的「邮件服务」卡片只能**看状态**：通道由 `.env` 的 `MAIL_PROVIDER` /
`SMTP_*` / `RESEND_API_KEY` 决定，后台改一次邮件服务商要动部署配置并重启服务；
而卡片上的「发送测试邮件」在未配置时也只能落盘。**能看不能改的看板 = 伪功能。**

### 改动

- **配置落库 + 密钥加密**：新增 `src/server/services/mail-config.service.ts`，
  配置存 `SiteSetting.mail_config`；密码 / API Key 用项目既有的 AES-256-GCM
  （`encryptChannelConfig`，密钥 `PAYMENT_CHANNEL_ENC_KEY`，已被生产弱密钥守卫保护）
  加密后落库。**后台接口只回「是否已配置」，永不回明文**。
- **字段级回落 env**：DB 没填的字段用环境变量兜底，`source` 字段区分
  「后台配置」与「环境变量兜底」——**既有部署升级后行为完全不变**。
- **发送链路走运行时配置**：`sendMail` / `getMailStatus()` / `sendTestMail`
  统一从 `getMailRuntimeConfig()`（30s 缓存 + 保存即失效）取通道、凭据与发件人；
  **连接池按配置指纹重建** —— 否则会出现「保存成功但发信还是用旧连接」的诡异现象。
- **后台可编辑**：卡片升级为「状态 + 配置表单 + 连通性自检」三合一：
  通道选择（SMTP / Resend / 仅写日志）、发件人、SMTP 主机·端口·用户名·密码·SSL、
  Resend API Key；密钥字段**留空或掩码 = 保留原值**（与支付渠道配置同一口径）。
- **允许渐进填写**：选了通道但字段没填全也允许保存，状态卡片持续告警
  「缺少必需配置：SMTP 主机」并说清后果 —— 比「保存即拒绝」更贴合运营节奏。
- **API**：`GET/PUT /api/admin/mail-config`（GET 同时返回脱敏配置与状态）；
  删除上一轮那个只读的 `/api/admin/mail-status`（配置与状态本就是同一张卡片的两半，
  拆两个端点只会多一次往返、多一个无人调用的端点）。
  审计只记「通道 + 是否更新了密钥」，**不记密钥内容**。

### 验证

- 新增 `tests/integration/mail-config.test.ts`（4 条不变量，全绿）：
  保存即时生效；**库内密文与后台视图都不含明文密码**（断言 `JSON.stringify` 不含
  密码串）；密钥留空保留原值（不改也不清空）；删除配置后回落 env（`source: "env"`）。
- Playwright 实测 12 项 UI 检查全通过、无 JS 报错；并**真实走了一遍保存与自检**：
  保存 SMTP 后「生效通道 = SMTP、配置来源 = 后台配置」，测试发送对一个必然连不上的
  主机**如实回传失败原因**（证明它不是转圈圈的假按钮）。验证后已把 QA 写入的配置
  从开发库清理干净。

## 2026-09-23（二）· 最佳系统状态：快照口径 + 上线自检 + 测试库治理（梦哥）

> 大爷：「1,2,3 按你说的做，我要最佳的系统状态」——把上一轮登记的三件事全部落地。

### 一、后台侧栏整理（大爷追加：「左边栏各种入口好乱」）

- **根因两条**：①17 个入口塞在「概览 / 运营管理 / 系统」三组里，而「运营管理」内部
  业务域来回跳跃（消息中心 → 分销 → 找回密码 → 退款 → 折扣码 → 支付渠道 → 物流 →
  法务 → 设置），找东西全靠记忆；②桌面侧栏与移动端抽屉**各维护一份导航列表**
  （注释还写着「与桌面侧栏同一份顺序」），新增入口要改两遍，漏一处就是「桌面有、手机没有」。
- **修复**：新增 `src/lib/admin-nav.ts` 作为导航**单一事实来源**（桌面/移动共用）；
  按**业务域**分 7 组（概览 / 订单与售后 / 商品与库存 / 客户与客服 / 营销与分销 /
  内容与合规 / 系统），组内按运营频率排序；权限过滤后**为空的组不渲染标题**。
- 验证：Playwright 实测桌面与移动抽屉**完全一致**（7 组 17 项），面包屑与高亮正确。

### 二、分销计佣切换到「快照口径」（原 P2 待决策项）

- **口径**：分佣链与等级都取 `relationPathSnapshot`（归属时刻写下）——
  「订单归属在谁的链上，就按那一时刻的链分佣」＝首次绑定定终身；
  等级取快照里的 tier，与「等级只影响之后的订单」一致。
  此前计提用的是**当时活链 + 当时等级**，于是订单支付与计提之间若发生换绑
  （对账补算可延迟数天）会按新链分佣，与快照字段的语义承诺相矛盾。
- **兜底**：快照缺失（历史订单/异常数据）→ 回落实时链，并**立即补写快照**，
  保证同一订单后续口径稳定。历史已计佣订单不回填（无法还原当时链路），
  由兜底逻辑覆盖。
- **改动中发现并修复的真实风险**：快照是历史数据，链上的人可能已注销/被删除
  （`User` 删除会级联清理关系表，但 JSON 快照不会跟着变）。若把幽灵 userId 直接
  拿去建佣金流水，会因外键约束让**整笔计佣失败**——旧实现不读快照所以从不踩到，
  这属于「换成快照口径后才会暴露」的边界。现在先做存在性过滤，过滤后为空则回落实时链。
- **测试**：新增用例「下单后上级链路变化，订单仍按归属快照分佣」——
  构造「下单后再给归属人挂一个新上级」，断言新上级**不拿任何佣金**；旧实现会给他二级佣金。

### 三、上线自检页（原「外部阻塞」的工程化交付）

``/admin/launch-readiness``：把「能否开门做生意」的条件集中成可核对清单。
每项都来自**真实检测**（渠道就绪状态、邮件通道状态、env 实际值、DB 查询），
无法从应用侧检测的（DNS SPF/DKIM、备份策略、证书）**不列**（宁缺勿滥）：

| 项 | 级别 | 检测内容 |
|---|---|---|
| 收款通道 | 阻塞 | 「已启用 + 已配置 + 网关就绪」的渠道数；区分「填了密钥但网关未接入」 |
| 邮件通道 | 阻塞 | `getMailStatus().deliverable`（未配置时全站邮件只写日志） |
| 管理员密码 | 阻塞 | 种子账号 `admin@example.com` 是否从未改密（默认密码是公开信息） |
| 站点地址 | 警告 | `SITE_URL` 是否仍是 localhost/占位域名（影响邮件链接、支付回调、SEO） |
| 密钥守卫 | 警告 | `REQUIRE_STRONG_SECRETS`（与 mock 支付守卫同一开关） |
| 文件存储 | 警告 | `STORAGE_DRIVER`（本地磁盘在多实例/容器重建下会丢文件） |
| 限流缓存 | 警告 | `REDIS_ENABLED`（未启用时限流退化为单进程内存） |

页面给出结论横幅（几个阻塞 / 是否具备上线条件）+ 按严重度排序的清单 + 「去处理」跳转。
**刻意不加 API 端点**：页面是 server 组件直调 service，避免再造一个无调用方的端点。

### 四、测试库治理（本轮排查 cron 用例失败的根因）

- **现象**：全量集成出现 4 个 `cron-jobs` 失败，其中 `runScheduledJobs()` 超过
  vitest 的 60s 单测超时；单跑该文件同样失败（排除并行/顺序干扰）。
- **根因**：集成测试**从不清理测试库**。多轮累积到 **25148 用户 / 1700 订单 /
  1441 归属 / 1287 佣金流水**后，cron 整轮任务（`runScheduledJobs` 在**单个事务**里
  依次跑：过期订单取消 → token/日志清理 → **分销对账** → **团队业绩日汇总**）
  会对全表聚合，总耗时越过 60s —— 表现为「与本次改动毫无关系的用例突然失败」。
- **修复**：新增 `prisma/sql/reset-test-data.sql`（TRUNCATE 全部业务表、
  保留 `_prisma_migrations`），`global-setup` 在结构同步后、写种子前执行，
  让每轮测试从确定规模开始。
  **双重安全保护**：global-setup 侧校验 URL 库名以 `_test` 结尾，SQL 内再用
  `current_database()` 断言一次——漏配 `.env.test` 时**拒绝执行**而不是清空开发库。
- **效果**：`cron-jobs` 7/7 通过，`runScheduledJobs()` 从 >60s 降到 **9.8s**。

### 五、后台 i18n 统一（消除「11 页走词典 / 16 页硬编码」的混用）

**背景与决策依据**：后台此前有两套写法 —— 11 个页面走 `t()`（`src/lib/admin-i18n.ts`
词典），16 个页面硬编码中文。查证发现：`setLang` **没有任何 UI 入口**，
`getLang()` 的注释也写明「后台锁定中文」—— 也就是说这不是用户可见缺陷，
而是**架构债**。两个方向二选一：

- 反向（t() → 硬编码）：省事，但删掉既有的双语词典与守卫测试 = 能力倒退；
- 正向（硬编码 → t()）：一次性把全部页面收敛到同一机制，未来若要开英文后台零改造。

**选正向**：词典 key 用**中文原文**（`{"中文原文": { zh: "中文原文" }}`），
`en` 缺省时 `translate()` 回落中文 —— 与词典既有条目同口径（现有 395 条里本就
多数只有 zh），因此**零翻译成本**，也避免「先翻译再迁移」的双重工作量与翻译偏差。

**执行**：
- 迁移 16 个页面、约 546 处用户可见文案到 `t()`；客户端组件注入 `useT()`，
  服务端组件（上线自检页）用 `getT()`。
- 新增 `scripts/merge-admin-i18n.py`：扫描页面里新引入的 `t("…")` 中文词条，
  与词典去重后**批量写入**（幂等）。多个迁移者并行改页面时，词典由单一脚本写入，
  避免并发写冲突 —— 比人工合并可靠得多。
  （实现细节：正则必须容忍 prettier 折行后的**尾随逗号** `t(
 "…",
)`，
  否则超长文案会静默漏收 —— 首次运行正是这么漏了 19 条，守卫当场抓回。）
- 复用优先：词条若已在词典（如「删除」→ `Delete`、「状态」→ `Status`），
  用既有英文 key 而不是新增中文 key，避免近重复词条。
- 词典累计新增 **403 条**；`tests/unit/i18n-keys.test.ts` 从红转绿（5/5）。

**过程中踩到并修复的两个静默漏检**（都会让迁移"看起来完成"）：
1. **prettier 去引号 + 只认 ASCII 的正则**：中文 key 是合法 JS 属性名，
   prettier 的 `quoteProps=as-needed` 会去掉引号写成 `加载佣金流水失败: { zh: … }`，
   而守卫与脚本读取词典的正则只匹配 `[A-Za-z_$]…` → 一条中文 key 都读不到，
   守卫误报「词典里没有该词条」、脚本误判「384 条待新增」。
   修法：两处正则的标识符分支放宽为 `[^\s"'{}:,()]+`。
2. **`t(变量)` 的词条静态扫不到**：有 11 条词条来自模块级常量
   （`COMMISSION_CARDS[].label` / `SEVERITY[].label` 等）在渲染时才传入，
   缺了会**原样显示 `{n}`**（`translate()` 对未知 key 返回 key 本身）。
   已补齐这 11 条，并在 QA 脚本里加了「页面文本不得出现 `{…}` 字面占位符」的检测。

**已知限制（如实登记，不伪造完成度）**：
1. **`t()` 无插值能力**：`已冲正 ${formatMoney(...)}` 这类动态文案仍为中文拼接。
   规则页的 4 处用 `{占位符}` key + `.replace()` 表达（占位符名已与词典对齐）。
   若要彻底统一，需给 admin 的 `t` 增加参数替换（对齐 shop-i18n 的 `t(key, params)`）。
2. **英文词条覆盖为存量问题**：词典多数条目只有 zh（含迁移前既有条目），
   英文模式下会回落中文。补全约 900 条翻译属独立工作项（当前后台锁中文，无人受影响）。

---

## 2026-09-23 · 后台顶级化整理 + 分销资金审查 + 客服留言下线（梦哥）

> 大爷指令（原文）：「帮我把后台管理整理一下 我感觉有点乱，做到顶级的后台管理样式，
> 和后台管理功能，好用才是最好的，仔细检查一下后台有没有伪功能、硬编码、
> 没有跟前端数据打通形成的信息/数据孤岛，把 bug 找出来修复，再仔细分析整个项目
> 离商业交付还有什么问题，把问题解决」；追加：「分销系统还有什么 bug 或问题，
> 把分销系统做完善」「新订单操作已发货时物流已填还提示让填写物流，复核状态操作逻辑」
> 「后台有客服留言前端怎么没有，是不是信息孤岛/用不上」——**不要了，一点实用性都没有，
> 还容易被人用来灌水攻击**」「到货通知在库存上货后是不是自动发邮件」「邮箱发送服务器的配置预览」。

### 一、后台管理全量摸底与整理

- **盘清资产**：28 个 admin 页面 / 19 条导航项（三组）/ 80+ admin API / 25 个 admin 组件；
  逐页扫描页头、加载态、空态、反馈、i18n 五个维度。
- **样式一致性**：`AdminPageHeader` 已 28/28 覆盖（无需整改）；**空态形态分裂**是主问题
  —— 4 页用 `EmptyState` 组件、3 页（notify-me / notifications / contact-messages）
  自绘「一行灰字 + 图标」，已统一到组件；`shipping` / `payment-channels` 经核实是
  「静态模板列表」（数据源是内置渠道目录，永远非空），`distribution/reports` 是指标页
  （`formatCny` 兜 0），三者结构上不需要空态 —— 避免了「为统一而硬塞空态」的过拟合。
- **伪功能清查**：无按钮空转、无死链。两个**无 UI 调用方**的端点经核实后补定位注释
  （`/api/admin/stats` 服务集成测试探活与外部监控；`/api/admin/distribution/rollup`
  是运维人工补算口，正常由 bridge 钩子调 service 层）——防止后人再当伪功能查一遍。
- **硬编码清查**：阈值类扫描干净（上一轮 lowStockThreshold 已可配）；**admin i18n 混用**
  （11 页 `t()` / 17 页硬编码中文）登记为架构债：后台全中文显示，不影响交付观感，
  统一到任一侧都需要大范围改动，留待专门的 i18n 批次决策。
- **数据孤岛（实锤）**：订单**认领体系**后端完整（`/assign` POST/DELETE + 审计 +
  「认领即标已读」），`serializers` 也返回 `assignee`，但**前端类型层就把该字段丢了**、
  UI 零入口 —— 多人协作下「谁在跟这单」无从知晓。三处打通：`AdminOrder` 补字段声明、
  列表状态列显示认领人徽章（hover 姓名+邮箱）、操作菜单与详情抽屉加「认领跟进／取消认领」。

### 二、大爷实测缺陷修复

- **「已发货」误报缺物流（实锤）**：`updateOrderStatus` 对 SHIPPED 的校验只看本次入参
  `extra`，而「状态下拉直推」走 `PUT /status` 不传 `extra`（只有 `/ship` 传）——
  订单上已有的 tracking 被完全忽略，即使已填也判定为空；连带直推路径下发货邮件与
  站内信的物流信息也会丢成空串。修复为统一「有效物流」口径（extra 优先、订单已有值
  兜底），校验/落库/邮件/站内信四处共用；错误文案由英文改为运营可读的中文。
  「订单无任何物流信息时仍拦截」的防漏填语义保持不变。
- **客服留言整体下线**（大爷决策：无商业价值 + 匿名表单即灌水攻击面）：
  前台 `/pages/contact` 与表单组件、`/api/contact`、后台管理页与 `/api/admin/contact-messages`、
  邮件模板 `contact-message`（含 react-email 组件）、`RATE_LIMITS.contact`（含全站熔断）、
  侧栏与移动端导航项 + 未处理角标统计、FAQ 页 `{contactForm}` 占位符机制（保留
  `{supportEmail}`，解析简化为单函数 `resolveFaqText`）、10 条词条（逐条 grep 确认零引用）、
  种子与库内 FAQ 文案、DB 表（迁移 `20260922000000_remove_contact_messages`）。
  **连带死链修复**：找回密码驳回邮件的按钮原先指向 `/pages/contact`，改为客服邮箱
  直邮（未配置邮箱时回落 FAQ —— 该页首屏即含邮箱，不会二次产生死链）。
- **到货通知补货邮件：链路本就完整，补回归测试**：`notifyRestock` 已接线 7 处
  （库存编辑 / 商品保存 / 上下架 / 批量状态 / 取消单回补 / 退款回补），支持变体级匹配、
  商品卡（图/名/卖点/价）、按订阅语种发信、预售口径切换、`status` 防重、管理员站内通知。
  新增 `tests/integration/notify-restock.test.ts` 锁定三个不变量：售罄不发、补货必发、
  重复触发不重发（另加「下架商品有库存也不通知」）。

### 三、邮件服务可见性（大爷点名的「配置预览」）

发现真实商业风险：`sendMail` 在通道配置不全时**静默降级**到 console（只打日志 +
落盘 `.mail-out`）—— `MAIL_PROVIDER=resend` 但 `RESEND_API_KEY` 未配时，订单确认、
发货通知、到货提醒、找回密码邮件**全部被丢弃而运营毫无感知**。

- 新增 `getMailStatus()`：区分「声明通道」与「实际生效通道」，列出发件地址与缺失配置，
  并给出说清后果的中文告警。
- 新增 `sendTestMail()`：走与业务邮件完全相同的通道，但**不吞异常**，失败回传服务商
  真实原因（避免又一个「转圈圈」的伪按钮）。
- 新端点 `GET /api/admin/mail-status`（仅布尔与变量名，不泄露密钥）、
  `POST /api/admin/mail-test`（限流 10 次/小时 + 审计留痕）。
- 新组件 `MailStatusCard` 挂到系统设置页（主表单之外，不随「保存」提交）：通道状态、
  配置清单（✓/✗）、降级警示条、连通性自检表单。

### 四、分销系统深度审查（14 条）与修复（11 条）

静态审查 24 个文件（服务/API/schema/测试），按严重度分级。整体工程素养高
（佣金只挂真实订单、`(orderId,toUserId,level)` 唯一幂等、提现扣款同事务 + 部分唯一
索引、对账/账户修复/风控/日汇总四层补偿），软肋集中在**同一行流水被两条并发路径读写
时的快照口径**。

**【P0】结算与冲正读事务外旧快照 → 双重入账 / 漏扣 / 状态复活**
- 三条路径（`settleOrder` / `applyOrderReversal` / `reverseCommissionManually`）
  此前各自在事务外读流水的 `status`/`settledAt`/`reversedCny`，再按旧值算钱并回写旧
  `status`。修复：统一改为事务内 `FOR UPDATE` 锁流水行 → 用库内当前值决策。
- 新增 `tests/integration/distribution-concurrency.test.ts`（4 例）覆盖
  「结算+全额冲正」「结算+部分冲正」「连续结算幂等」「先冲正后结算」—— 这些不变量
  此前**零覆盖**，而旧实现在「结算先到」交错的确定性顺序下就会算出 100（漏扣）。

**【P1-1】账户对账修复用快照绝对值覆盖**：快照与写入之间若有并发结算/提现，期间变动
被整体抹掉（用户可能同时持有冻结额与被还原的余额 = 凭空多钱）。改为事务内锁账户行 +
用同一口径重算期望值后写回。

**【P1-2】部分冲正被统计口径忽略**：账户摘要与平台报表按原始 `amountCny` 累加，
部分退款后「已结算佣金」大于实际入账的 `balance`（同一响应自相矛盾），`payoutRatio`
虚高。`summariseCommission` 与报表统一为净额 `amountCny − reversedCny`；报表总支出
不再计入已冲正金额；新增 `commissionSettledCny`，前端不再用减法倒推。

**【P1-3】对账冲正候选集无排序**：无 `orderBy` 时 `take` 反复返回同一批旧单，
新的「已退款未冲正」订单可能永远扫不到（退款钩子失败即永久漏冲正）。两个候选查询都
改为 `createdAt desc`。

**【P1-4】团队业绩「有汇总行就不回落实时」**：日汇总只覆盖最近 1~2 天，30 天窗口会
静默只统计 2 天（业绩小一个数量级）。改为按**覆盖度**判断（窗口首日未被汇总覆盖就回落
实时口径）。原集成测试断言 `source="rollup"` 恰好固化了这个 bug，已更正为 `live` 并补
「覆盖完整时走预聚合」的断言。

**【P2】六条**：①**循环绑定防护** —— 只挡直连自绑不够，B 成为 A 的下级后 A 再作为客户
绑 B 会成环互刷（现有风控的 `fromUserId===toUserId` 信号查不出），新增绑定期闭包校验 +
`BindOutcome "CYCLE"` + 集成测试；②规则说明页未过滤 `tierLevel`，把等级专用规则当通用
比例下发（同 level 两条不同比例），改为只下发 `tierLevel=0`；③`my/orders?status=<非法>`
直传 Prisma 枚举 → 500，改白名单校验；④计佣热路径每笔支付都「全量读规则 + 去重删除 +
无条件写库」，拆分为「脏数据自愈每进程一次 + 空表播种判断每次」（前者是历史修复、后者
不能省：管理员删光规则会让佣金静默算 0）；⑤导出 `take: 10_000` 静默丢行 → 返回
`{rows,total,truncated}`，超限时文件名标 `-partial` 并回传总数响应头；⑥风控自购判定
「先取最近 200 条流水再内存过滤」→ 改为原生 SQL 库内字段比较，不再受窗口限制。

**追加修复（2026-09-23 第二轮，审计剩余 3 条 P2 中的 2 条）**：
- **换绑重建子树的正确性与性能**：子节点此前只重算闭包表，`distLevel/distPath/
  invitedById` 保持旧值 —— 「我的下级」按 `distLevel` 展示层级，换绑越深错得越多。
  现在 BFS 中逐层同步这三个字段。同时把「每节点一个独立事务」改为**分块提交**
  （每 50 个节点一批，批内原子），中途异常不再留下「一半新链、一半旧链」的混合闭包
  （幂等，可整体重跑收敛）。改造中发现并修掉一个真实陷阱：批内未提交时
  `getClosure()` 回查数据库会读到旧链 → 父链改为**内存逐层推算**（口径与
  `planClosureRows` 完全一致）。
- **`relationPathSnapshot` 的口径谎言**：字段在下单时写入却从未被读取，注释却承诺
  「快照不可变」，而计佣实际用实时链 + 实时等级。已在写入处补上**真实口径说明**
  （含两种口径差异与切换成本），避免后人误读。

**唯一登记待决策（1 条）**：是否把计佣切换到「快照口径」（首次绑定定终身 + 支付时等级）。
需要为等级新增快照字段（当前只有链快照）、回填历史数据、重校分销测试 —— 属独立批次，
文档已写明决策要点，**不擅自改动资金口径**。

---

## 2026-09-22 · 商业交付整改第二批：伪功能清除 / 硬编码治理 / 数据孤岛打通（梦哥）

> 大爷指令（原文）：「项目上不要硬编码，不要过拟合，解耦的思想，网店不要有伪功能，
> 把数据打通，不要有数据孤岛、信息孤岛，把所有功能工程化落地，能达到交付使用」。

- **① token 自助重置死链路清除（伪功能）**：`/api/auth/reset-password` API、
  `/auth/reset-password` 页、表单组件、`ResetPasswordEmail` 邮件模板、JWT `fp` 字段与
  `reset` purpose、`RESET_TOKEN_TTL` 常量、schema、6 条孤儿 i18n 词条、集成用例、
  qa-sweep 路由条目——全链删除。依据：无 token 签发方、无入口链接、无邮件发送路径
  （已被 13.10 的 B-2 人工审批流取代），删的是不可达代码，无能力损失。
  i18n-keys 守卫测试当场抓回 1 条误删词条（change-temp-password 在用），恢复后全绿。
- **② 低库存阈值可配置化 + 数据打通（硬编码治理）**：新增 `src/lib/inventory.ts`
  单一事实来源（缺省 5，运营口径 `isRestockAlert` 含售罄 / 顾客口径 `isScarceInStock`
  仅现货两个具名谓词）；`SiteSetting.lowStockThreshold` 后台可配（读取端
  `clampThreshold` 0–999 钳制，30s 缓存，与 stats / 商品 API 同走 `getSiteSettings()`
  保证同源）；`getAdminStats` 的 `lowStockCount / notifyMeCount / lowStockThreshold`
  三个「算了没展示」的指标真正下发；仪表盘新增可点击「运营信号条」
  （低库存 → `/admin/products?stock=low&status=ACTIVE` 预筛列表，与计数完全同口径；
  到货提醒 → `/admin/notify-me`）；商品管理页新增「低库存」筛选 + URL 深链初始化 +
  红色高亮改用 API 随列表下发的生效阈值；系统设置页新增「库存预警」数字输入
  （0–999 校验 + 空值回落缺省，服务端 clamp 双保险）；顾客侧 buy-panel
  「仅剩 N 件」改用 `isScarceInStock()`，不再写死 `<= 5`。
- **③ 限流策略集中化（硬编码治理）**：新增 `src/lib/rate-limits.ts`，14 条策略
  `satisfies Record<string, RateLimitPolicy>` 类型收口；12 个 route 文件全部调用点
  改为 `...RATE_LIMITS.xxx` 展开，数值零变更（纯重构，行为等价）；登录特例
  `resetRateLimit("login:__global__")` 保留原键名。
- **④ sitemap 规范化（SEO）**：补 `/collections` 索引页；分类 URL 从
  `/products?category=<slug>`（307 跳转链）改为直连 `/collections/<slug>`。
- **⑤ 死变量清理**：product-card 未使用变量 `hasDiscount` 移除（eslint warning 清零项）。
- **⑥ 文档事实对齐**：README 迁移说明从「5 个迁移」的硬编码枚举改为「以目录为准」
  （实际已 28 个）；package.json description `Next.js 14` → `Next.js 16`；
  .gitignore 增加 `*.bak` / `*.bak-*` 防工具链备份文件入库。
- **测试自给自足修复**：cod-flow 集成用例的 afterAll `deleteMany` 删订单**不回补库存**，
  多轮运行把种子商品净抽干（下单时报「只剩 2 件」）。beforeAll 选取商品后 pin 到
  充足值、afterAll 恢复原值——轮内绝对够用，跨轮零净消耗。
- **回归证据**：tsc 0 错；单测 22 文件 246/246；集成 15 文件 127/127
  （cod-flow 修复后 6/6，真实退出码显式核验）；i18n-keys 守卫全绿；
  改动文件 prettier 全过。

## 2026-09-22 · 修复首屏「顶栏 + 空 main + 页脚、下方一整屏白」（对齐原站加载观感）

> 大爷反馈：「网站加载的时候下面是白色的，上面是网店的顶栏和底栏，感觉怪怪的；
> 原网站 shop.x.com 加载网店页面就直接显示出来」。

- **根因**：`(shop)/loading.tsx`、`(shop)/products/[slug]/loading.tsx`、`(shop)/search/loading.tsx`
  均导出 `null` 作为 Suspense 兜底。Next 只要见到 `loading.tsx` 就会在 `children` 外包一层
  Suspense 边界 → 服务端把「外壳（header/footer）+ 空 fallback」先流式下发，真实内容被塞进
  `<template id="B:0">` 交由内联脚本二次注入。浏览器**首帧**因此是：
  `header 0→65`、`main` 高度 **0**、`footer` 紧贴 `65→273`、下方 **627px 纯白**（1200×900 实测）。
- **修复**：删除上述 3 个整页兜底文件（任何 fallback 都是可见的中间态，换骨架同样治不了根）。
  需要加载指示时改用**页面内** `<Suspense>` 精确框住慢区块。
- **验证（Playwright + 流式响应埋点）**：
  - 首屏 HTML 中挂起标记 `<!--$?-->` **1 → 0**；首页 `All Products` 落在 `<main>` 内部
    （字节偏移 14610）而非 `<template>`；禁用 JS 冻结首帧实测 `main` 高度 **0 → 4911**、文字 **0 → 842**。
  - 子路由首帧同样带内容：`/collections` 939px、`/products/[slug]` 1324px、`/search` 493px。
  - 客户端路由切换：旧页面完整保留至新页面就绪，采样 54 点 `main` 高度最小 1511，无白屏、无页脚上跳。
  - `npx tsc --noEmit` 通过；8 条主要路由（含 `/admin/login`、`/auth/login`）全部 200。

### 追加：`/pages/accessibility-statement` 页脚下方留白（同期）

- **现象**：该页 1200×900 下文档高仅 900，黑色页脚止于 747px，视口底部露出 **153px 白底**。
- **排查**：全站扫描后确认**只有「内容短于视口」的页面**才有此白条
  （`/pages/accessibility-statement` 153px、`/cart` 空态 243px）；其余页面页脚均落在文档底部、留白 0px。
  机制来自 `(shop)/layout.tsx`：根节点 `min-h-screen flex flex-col`（白底铺满视口）+ `main` 刻意不给
  `flex-1`（2026-09-21 为对齐原站短页面页脚位置而定），故内容不满一屏时页脚停在内容之后。
- **不改布局的理由**：2026-09-21 的原站实测记录明确「原站短页面（购物车空态）页脚下方同样是 64px 白」，
  即原站并未做页脚吸底；若改 `flex-1` 会与该结论相反，并使 `tests/e2e/visual.spec.ts` 的 5 张基线再次过期。
- **定案（大爷 2026-09-22 确认原站该页为分节长文）**：问题在内容而非布局——
  `src/lib/policy-defaults.ts` 的《无障碍声明》默认值只有 3 段（正文 474px），
  而同一文件内隐私政策 7 节、数据共享 5 节，完整度明显不对等。
- **修复**：默认文案补为 **8 节完整版**（承诺 / 符合性状态 / 无障碍功能 / 浏览器与辅助技术兼容性 /
  技术规格 / 已知限制 / 反馈与联系方式 / 评估方式），中英各一份，后台仍可整段覆盖。
- **验证**：文档高 **900 → 2204**，页脚 1996..2204 落在文档最底部，**页脚下方留白归零**；
  中英双版渲染均含新分节；`npx tsc --noEmit` 通过。

## 2026-09-21 · 商业交付整改 8 项 + 分销专项 + 全项目扫雷（P0/P1 批量修复）

> 完整明细与验证证据：[docs/COMMERCIAL_READINESS_FIXES_2026-09-21.md](docs/COMMERCIAL_READINESS_FIXES_2026-09-21.md)

- **自查清单 8 项全部完成**：生产 mock 支付守卫、渠道化 Stripe 对账门控、COD 货到付款语义（跳过支付 /
  到付金额落库 / 可取消 / 邮件 / 展示 / 迁移）、多币种分账恒等式（新增 `allocateRateAmounts`）、IP 限流塌缩
  （请求头指纹兜底 + 全站熔断）、Redis 密码与端口回收、客服留言后台收件箱、管理端订单编辑（地址 / 内部备注 / 批量状态）。
- **分销专项 P0/P1**：等级佣金规则唯一键补 `tierLevel`（修「等级规则覆盖通用规则 → 该层佣金静默归零」）、
  冲正分母与计佣基数同源、日汇总折算改用 `toCny`、汇总改团队口径与实时一致、绑定失效不再锁死客户。
- **全项目扫雷 P0/P1**：零小数币种（JPY 等）拒绝下单防多收 100 倍、Stripe 会话有效期对齐订单过期窗口、
  整单退款只退剩余可退额（防部分退款后二次全额退款）、生产 compose 补齐必填变量与邮件配置、
  单笔退款接口提权 ADMIN、`REQUIRE_STRONG_SECRETS` 空值语义（不再一票关停四道守卫）、
  `db push` 后自动重建原始部分唯一索引。
- 新增迁移：`20260921130000_cod_fee`、`20260921140000_admin_note`、`20260921150000_commission_rule_tier_unique`。

## 2026-09-21 · 分销系统 P0 加固 + 通知（商业化交付前的问题清单）

> 迁移：`prisma/migrations/20260921061158_distribution_hardening`
> 大爷的要求：「把问题扼杀在交付使用之前，不要差不多，工程级落地」。

### P2-15 分销商等级 + 按等级差异化比例
- `distributor_accounts.tier`（0=普通，1~10）+ `commission_rules.tierLevel`：
  **同作用域内「等级专用规则」覆盖「通用规则」**，未命中的等级回落到通用比例。
- 关键实现细节：`getCommissionChain()` 现在把**每一环本人**的等级一并带出 ——
  佣金是逐级解析的，二级受益人的等级决定二级比例，不能用归属人的等级一刀切。
- 后台：分销商列表新增「等级」列与「设等级」操作（含调整原因）；佣金规则弹窗新增等级字段。
- 分销商侧：规则说明页在存在等级规则时给出提示。改等级**只影响之后的订单**，
  历史流水按当时规则快照保留（账本不回算）。**+5 条单测 +1 条集成用例**（后者顺带验证了
  「10% + 20% 顶到总上限 30% 时第三级被整体跳过」）。

### P2-12 团队业绩预聚合
- 新增 `distribution_daily_stats`（分销商 × 日：订单数 / 销售额 CNY / 佣金 CNY / 团队人数快照）
  + 幂等汇总作业 `rollupDistributionDailyStats()`：调度器每轮汇总最近 2 天，后台可手动重跑。
- `getTeamStats()` **优先读汇总表**（`source: "rollup"`），无数据时回落实时聚合（`source: "live"`）——
  页面永远有数，且口径由同一个作业写入，不会"报表和明细对不上"；明细页仍读实时表。
- 汇总时**过滤已不存在的用户**：`order_attributions.distributorId` 是无外键的历史快照，
  硬删用户（GDPR）后仍留有记录，直接写汇总会撞 `distribution_daily_stats.userId` 外键
  （集成测试真实复现并修复）。**+1 条集成用例**（包含幂等重跑断言）。

### P1-11 推广海报（SVG 分享图）
`GET /api/distribution/my/poster`（`?download=1` 带附件头）服务端直出 **1080×1620 海报**：
品牌名（读站点设置，多语）+「分享有礼」+ 大二维码 + 推广码 + 专属链接 + 合规提示。
- 二维码以**嵌套 `<svg>` + 原 viewBox** 内联（最初按固定 scale 变换，实测二维码被缩成一小块 —— 已修）；
- 文案由服务端按语言固化（海报是脱离应用的图片，不能依赖前端 i18n 运行时）；
- 不引入 sharp/canvas：SVG 矢量、体积 ~3.6KB，手机端可长按保存/转发。分销中心推广码卡新增「下载推广海报」。

### P2-14 并发正确性与大团队性能（"钱不会被算两遍"的硬证据）
- **并发结算同一订单 5 次** → 每位受益人只入账一次（断言余额增量 == 该流水净额，而不是 5 倍）；
- **并发按 50% 冲正 5 次** → 累计只冲一半、状态不变、余额只扣一次（CAS 条件更新生效）；
- **1000 人团队**（300 一级 + 700 二级，闭包 2000+ 行）：闭包查询 / 团队统计 / 佣金链解析
  全部在时间上界内（实测 757ms 完成整组）。

### P2-13 分销配置与佣金规则缓存（Redis → 内存自动降级）
配置与启用规则是这条链路上最热的读（每次绑定/归属/计提/提现都读），改为走 `lib/cache`：
**写时精准失效**（`saveDistributionConfig` 与后台规则增删改均调用 `invalidateDistributionCache()`），
不靠 TTL —— 否则"刚把比例改成 8%、新订单还按 10% 算"在生产上极难排查；规则额外保留 60s TTL 兜底
（防脚本/运维绕过接口改库）。**刻意不缓存任何"钱"的视图**（余额/佣金/团队业绩）：这些数字必须实时可信。

### P1-8 管理后台四个运维视图 + 换绑审核
- **人工冲正单条佣金**：`POST /api/admin/distribution/commissions/[id]/reverse`（金额可部分，
  原因必填）。用于刷单认定 / 客服赔付 / 错单纠正等自动冲正覆盖不到的场景，与自动冲正共用
  同一套账本口径（增量 + CAS + 已入账部分扣回，可为负=挂账），幂等且留审计。
- **CSV 导出**：佣金流水与提现记录各一个导出接口，走 `lib/csv` 统一转义
  （Excel 公式注入防护 + UTF-8 BOM）；佣金导出含「已冲正金额」列，提现导出含收款人实名/方式
  （线下打款要拿这份表去银行）。
- **风控视图** `/admin/distribution/risk`：集中五类信号 —— 自购返佣（自买自返/刷单特征）、
  负余额挂账、近 30 天高频退款客户、大额在途提现、**永不生效的超层级规则**，按严重程度排序。
- **自动升级记录** `/admin/distribution/promotions`：分销商资格是自动授予的，运营必须能回答
  「这个账号什么时候、因为谁成为分销商」——按 `firstPromoteAt` 倒序列出人、时间、邀请人与已带人数。
- **换绑审核**（新增 `rebind_requests` 表 + 后台页面）：换绑会改变客户**及其整棵下级子树**的佣金
  归属，属于资金关系变更 —— 因此即使后台开启 `allowRebind`，客户点他人链接也只**受理**为待审申请
  （重复点击不会重复建单），平台通过时才真正落库，落库路径复用 `skipApproval` + 子树闭包重建。
  **+2 条集成用例**（审核流三个断言 + 人工冲正扣账与防重复）。

### P1-9 佣金规则：固定金额返佣 + 生效期
- `commission_rules` 新增 `mode`（RATIO | FIXED）与 `fixedAmount`：支持「每单固定返 X」
  与「按比例返 Y%」两种口径并存、逐级各自取值（迁移 `..._commission_rule_fixed_mode`）。
- **固定金额同样受总比例上限约束**（换算等效比例）：否则"固定 5 美元"在 20 美元订单上
  就是 25%，直接返穿毛利。超限整层跳过，绝不截断单笔金额。
- `effectiveAt/expireAt` **真正生效**：`resolveRule()` 纯函数按注入的 `now` 判定
  （到期当刻即失效、未填=立即生效长期有效），此前字段只存在于 schema 里没接线。
- 后台规则页/接口新增口径选择、固定金额、生效期（datetime-local）；
  分销商规则说明页同步展示"每单固定 X"与生效期。**+9 条单测**（含边界与混用）。

### P1-10 提现 KYC + 《分销规则》确认
- 一期是**线下打款**，必须能核对到人：`withdraw_records` 落 `payeeName/payeeMethod/userEmail`；
  首次提现**服务端强制**实名（≥2 字）与收款方式，之后可省略并沿用上一次的值（减少重复录入）。
- `distributor_accounts.termsAcceptedAt` 记录规则确认时间（提现前必须勾选，合规留痕），
  账户摘要对外暴露 `termsAccepted`，前端提现页据此显示"我已阅读并同意"并可跳转规则说明页。
- 后台提现审核页展示收款人/方式；本人列表也只回显账户尾号（页面可能被旁人看到）。**+2 条集成用例**。

### P0-1 部分退款按比例冲正
原实现只在「整单变 REFUNDED/CANCELLED」时冲正 —— 部分退款后订单仍是 PAID，
佣金**不冲**，等于给已退款的部分白付佣金。现在：
- 比例 = 「累计已完成退款单金额 ÷ 订单应付金额」（订单整单退款/取消则 = 1）；
- 流水新增 `reversedAmount/reversedCny` 记录**累计已冲正额**，每次只处理增量，
  并用 `reversedCny/reversedAmount` 作 CAS 条件更新 → **幂等 + 并发安全**；
- 结算按**净额**入账（已冲正部分不进余额）；已入账部分按增量扣回（可为负=挂账）；
- 退款审批接口即时挂钩 `distributionBridge.onOrderRefunded()`，每分钟对账继续兜底。

### P0-2 注销/删除用户不再级联删账本
`commission_logs.toUserId`、`distributor_customer_binds.{distributorId,customerId}`、
`withdraw_records.userId` 由 `Cascade` 改 **`SetNull`**，并新增
`toUserName/toUserEmail/userEmail` **冗余快照** —— 用户注销（软删）或硬删（GDPR 抹除）后，
佣金流水与提现凭证仍可对账、客服仍可追溯。

### P0-3 换绑重建整棵子树（修掉真实错账 bug）
`bindCustomer` 的 **REBOUND 分支提前 return**，只有「首次绑定」分支重建闭包 →
换绑后客户本人的新上级生效了，但**他下级的分销链仍指向旧上级**，之后下级产生的订单
继续按旧链分佣（系统性错账）。现在新增 `rebuildSubtreeClosure()`：沿直接下级广度优先
整体重算祖先链（集成测试覆盖到距换绑点两跳的第 3 层）。

### P0-4 历史订单不回溯归属
新增 `SiteSetting.distributionEnabledAt` 启用时间基线：早于基线的订单
**不用今天的绑定改写历史归属**，一次性标记为自然单（`archivedNatural` 计数可见）。

### P0-5 CRON 关闭也能结算（结算兜底）
到期结算只由进程内调度器驱动，`CRON_ENABLED=false` 时佣金会永远停在「在途」。
新增 `POST /api/admin/distribution/settle`（可指定订单强制结算，用于客诉加急），
后台总览页加「结算到期佣金」按钮。

### P0-6 账户与流水一致性对账
账户余额是物化汇总，此前只补漏记、不校验一致性。新增 `verifyAccountConsistency()`：
按「已结算净额 − 已打款 − 在途冻结」推导应有余额，检出偏差并可**一键按流水口径修复**
（`POST /api/admin/distribution/verify`，后台「对账校验 / 修复账户」按钮，幂等）。

### P1-7 分销通知（站内信 + 邮件）
新增 `distribution/notify.service.ts`：佣金**结算到账**、佣金**冲正**、
**提现**提交/通过/驳回/打款、**成为分销商** —— 站内信写中英双份，邮件走新模板
`distribution-notice`（按站点默认语言渲染）。
**全部 fire-and-forget**：邮件可能走真实 SMTP，绝不阻塞结算/退款/提现接口
（实测把退款审批拖到 70 秒，已修）。消息中心新增 `distribution` 类型图标。

### 回归
`tests/integration/distribution.test.ts` 新增 7 条 P0 用例（部分退款比例/幂等、
硬删留痕、换绑子树、历史归属、强制结算、账户对账），全部通过。

## 2026-09-20 · 分销 / 多级佣金系统（隔离模块，接口调用接入）

> 大爷要求：**不要改废本网店的面目**，分销要做**隔离、解耦、接口调用**。因此本模块的
> 设计前提是「商城可以完全不知道自己装了分销」——见下面的接入面清单。

### 🟢 数据层（独立命名空间，只给 User/Order 加最小外键）
- 新增 `DistributionRelation`（**闭包表**，支持无限级、depth=0 含自己）、
  `DistributorCustomerBind`（客户归属，`customerId` 唯一=数据库级「不可抢绑」）、
  `CommissionRule`（GLOBAL/CATEGORY/PRODUCT × 层级比例）、`CommissionLog`
  （只追加流水，幂等键 `(orderId,toUserId,level)`）、`DistributorAccount`（CNY 余额/冻结/累计）、
  `WithdrawRecord`（提现单）、`OrderAttribution`（下单归属快照，不可变）
- `User` 扩展：`referralCode`（唯一推广码）/`invitedById`/`distPath`/`distLevel`/`isDistributor`/`firstPromoteAt`
- 迁移 `20260920185628_distribution_module`（dev 库已应用；测试库 db push 同步）
- 依赖新增：`qrcode` + `@types/qrcode`（服务端渲染推广二维码 SVG，客户端零依赖）

### 🔌 与商城的唯一接入面（`src/server/services/distribution/bridge.ts`）
- 商城**只** import bridge，从不 import 分销内部实现；bridge 内部**动态 import + try/catch**，
  任何分销故障都只记日志，绝不影响下单/支付/发货/退款
- 新增 6 个调用点（全部加法、每个 1~3 行）：
  `src/proxy.ts`（推广参数 → 签名 cookie）、`api/auth/register`（注册绑定）、
  `api/orders`（归属快照）、`order.service`（支付计佣 / 确认收货结算 / 退款冲正 ×2 入口）、
  `server/jobs/scheduler.ts`（分钟级对账补偿）
- 总开关 `DISTRIBUTION_ENABLED=false` 时：代理不写 cookie、钩子零开销、API 全 404、入口隐藏
  —— 商城行为与未装该模块逐字节一致

### 🟢 业务闭环
- **推广与绑定**：人人有专属推广码/链接/二维码；`?ref=`/`?distributor_id=`/`?invite=` 三形态兼容，
  代理层签名 cookie（30 天归因窗口）防篡改；首次绑定定终身、复购只看绑定不看链接、
  已绑定客户**不可抢绑**（唯一约束兜底）、自然流量不归属不分佣
- **自动升级**：首次成功推广即 `isDistributor=true`，无需申请/审核；闭包按「他作为客户绑定的上级」重建
- **逐级分佣**：计佣基数=商品**实付**小计（不含运费/税）；默认三级 10%/5%/2%、层级与总比例可配
  （总比例封顶=合规红线）；自购默认不返自己、上级照常分；金额精确到分并折 CNY 记账
- **结算与冲正**：支付后 PENDING → 确认收货立即 SETTLED（或持有期到期由调度器结算）→
  退款/取消 REVERSED 并从余额扣回；每步条件更新「认领」，并发下不重复入账
- **对账补偿**：`reconcileDistribution()` 每分钟扫平「漏归属 / 漏计佣 / 漏冲正 / 到期未结算」，
  因此钩子漏调不会变成错账（商城侧钩子只是加速器，不是唯一保证）
- **提现**：申请（原子扣余额 + 防拆单）→ 审核通过 → 线下打款标记 → 打款核销；驳回解冻退回。
  一期不做自动代付（需主体资质 + KYC + 代扣个税）
- **行级权限 + 脱敏**：全部由服务端出参前完成（分销商只查自己；手机号 `138****1234`、
  邮箱 `a***@x.com`、姓名 `张**`、地址只给省市；间接下级只给汇总）

### 🖥️ 界面（入口形态按大爷 2026-09-20 反馈重做）
- **不进主站左侧导航**：大爷反馈「左边单独给个我的推广入口是污染主站、里面什么都有太杂乱」，
  因此账户左侧导航**不列**该项（`account-nav.ts` 保持原样），只保留账户里的一张
  **分享小卡片**（`DistributionShareCard`，挂在 `/account/profile`）：
  一行说明 + 专属链接 + 复制按钮；**成功推广后**卡片里才出现「进入分销中心」（新标签页打开）
  与「可提现/在途」两个小数字 —— 对应「有人下单才自动出现分销入口」。
- **现代面板视觉（大爷第三轮反馈：「都是线条和框框，太简单粗糙，要有流行的圆角」）**：
  新增**作用域化**的现代卡片口径 —— `globals.css` 里只对 `[data-modern-cards]`（账户概览）与
  `[data-dist-center]`（分销中心内容区）覆盖 `.rounded-md`(→10px) / `.shadow-card`(→柔和分层阴影)
  并新增 `.panel`（14px 圆角 + 悬浮感 + 表格圆角裁切）。**商城前台不受影响**（仍是 shop.x.com 的
  方角无阴影）。同批：统计卡改成「图标胶囊 + 大数字 + 灰标签」，分享卡改渐变底 + 黑色图标块 +
  圆角链接框，Tab 改胶囊（激活态黑底白字 + 轻阴影），分销中心补 **`分销中心 / Distribution center`
  页面主标题 + 副标题**（并移除页内重复的小标题）。
- **i18n 反向守卫 + 中英混排修复（大爷 2026-09-20：「中英混着用，不允许有这样的情况发生」）**：
  `/account/profile` 的「修改登录邮箱」卡片此前只把标题接了词典，里面的
  `Current sign-in email` / `New email` / `Current password` / `Confirm changes` /
  两处 placeholder 与三条 toast **仍是硬编码英文** → 中文界面中英混排。本轮全部接入 `t()`；
  更重要的是补了**反向守卫** `tests/unit/i18n-hardcoded.test.ts`：
  既有的 `i18n-keys.test.ts` 只能查「t() 的键在不在词典」，**看不见压根没用 t() 的文案**，
  新守卫直接扫账户区与分销中心的 JSX 文本节点与可见属性（placeholder/aria-label/title/alt/label），
  发现硬编码英文即红灯（已用「故意塞入硬编码」反向验证过它真的会报警）。
- **`/account` 重做为「账号总览页」（大爷实测反馈「分享卡片没有看到」+「要像账号总预览页」）**：
  原先 `/account` 是 `redirect("/account/notifications")`，卡片却挂在 Profile 子页 ——
  点顶栏 Account 进来看到的是消息列表，根本找不到分享入口。现在 SSR 直出总览：
  **四张概览小卡（累计订单 / 进行中 / 收货地址 / 未读消息，未读带红点）+ 分享小卡片 +
  最近两单（复用订单页同款 `OrderCard`，带「查看全部」）**，空态给「去逛逛」。
  全部复用商城既有视觉（`Card` 细边框 + 方角 + 常规字重），不引入新设计语言、
  也不做成"什么都有"的仪表盘。
- **分销中心 = 独立窗口 + 同款视觉**（`/distribution`，独立路由组 `(distribution)`，从分享卡片
  **新标签页**打开）：首版做成了"只有品牌 + 返回店铺"的极简外壳，大爷反馈「样式太简单了，
  能不能跟原网站风格一样，只不过新开一个窗口」——现在**套用商城完全相同的页头/页脚/Provider**
  （复用 `(shop)/layout.tsx` 同一批组件），二级 Tab 用账户导航同款样式（激活态黑底白字）。
  「独立」体现在功能与入口（不占主站导航、不塞进账户页），不再是"简陋外壳"；
  模块内一条横向 Tab（概览/客户/订单/团队/佣金/提现/业绩），不是"里面什么都有"的大杂烩。
- **推广链接指向商城首页**：分享给朋友的是 `https://站点/?ref=CODE`（正常购物页 + 二维码同链接），
  归属由代理层签名 cookie 完成；分销中心路径与推广链接彻底分开。
- 平台后台新增「分销」入口（二级 Tab：总览/分销商/关系链/佣金规则/佣金流水/提现审核/对账报表）
- 新增 API：分销商端 11 个（`/api/distribution/**`）+ 平台端 12 个（`/api/admin/distribution/**`）

### ✅ 验证
- 纯函数单测 `tests/unit/distribution.test.ts` **30/30**（比例优先级、总比例封顶、自购、
  层级上限、闭包行去重、脱敏、推广码签名防篡改、开关默认值）
- 集成测试 `tests/integration/distribution.test.ts` **19 例**（绑定/自动升级/闭包链路/不可抢绑/
  复购归属/自然流量/三级计佣金额/幂等/确认收货结算/退款冲正扣回/自购/提现三态/行级权限与脱敏/对账补偿）
- QA 端到端 `scripts/qa/qa-distribution.mjs` **ALL PASS**：推广链接 cookie → 注册绑定 → 自动升级 →
  下单归属 → 支付三级计佣 → 发货确认收货结算 → 后台 4 页 → 分销商后台 5 页与脱敏 →
  提现申请/审核通过/标记打款（冻结核销）
- **全量回归 34 文件 / 317 用例全绿**；tsc 0 错误、eslint 0 errors（16 存量 warning，本轮新增文件 0）
- **测试抓到的真 bug**：闭包表在真实流程里没人写入（`getCommissionChain` 恒为空 → 一分钱都算不出）。
  根因是把「建立上级关系」写在了一个没人调用的函数里；已改为自动升级时按客户绑定重建闭包，
  并补齐「换绑后重建」路径。另修正 `planClosureRows` 会产出重复闭包行（主键冲突）的缺陷。

## 2026-09-20 · B-2 原站式找回密码（人工审批 → 临时密码 → 首登强制改密）

### 🟢 新功能（大爷明确要求，13.9 最大一块）
- **数据层**：新增 `PasswordResetRequest`（`status` PENDING/APPROVED/REJECTED、`email` 快照、
  `note`、`handledById`/`handledAt`、`rejectReason`、`ip`）+ `User.mustChangePassword`
  / `User.passwordChangedAt`；迁移 `20260919233506_password_reset_requests`（dev/test 双库已应用）
- **用户提交**：`POST /api/auth/forgot-password` 改为**建审批申请**——防枚举（邮箱不存在/
  停用/注销中/已有在途申请一律同一句回执，响应体不含任何分支信号）+ 双限流（单 IP 3/min、
  单邮箱 3/h）+ 同账号仅一份在途申请；落库即 `notifyAdmins`（直达 `/admin/password-resets`）
- **后台待处理**：新页 `/admin/password-resets`（侧栏「找回密码」，ADMIN 专属，紧跟消息中心）
  + `GET /api/admin/password-resets`（状态/搜索筛选 + `pendingCount`）
  + `POST /api/admin/password-resets/[id]`（approve/reject，要求 ADMIN）
- **批准**：`src/lib/auth/temp-password.ts` 生成 **14 位强随机临时密码**
  （`crypto.randomInt` CSPRNG + 拒绝采样、剔除 `0O1lI` 混淆字符、必然含大小写/数字/符号以过
  `passwordSchema`）→ bcrypt 入库 + `mustChangePassword=true` + **吊销该用户全部旧会话** →
  邮件模板 `temp-password` 下发明文；批准响应**一次性回显明文**（邮件通道不可用时的运营兜底，
  DB 不存明文、后台不回显历史）
- **首登强制改密（双重门控）**：`proxy.ts` 用 `pwd_change_required` cookie 把用户钉在
  `/auth/change-password`（页面 307；其它 API 403 `PASSWORD_CHANGE_REQUIRED`；放行
  `/api/auth/**`、`/api/user/password`、`/api/currency`、`/api/healthz`）+ `requireUser()`
  读 DB 的 `mustChangePassword` 兜底（手删 cookie 也绕不过）；改密复用 `PUT /api/user/password`，
  成功后清标记/清 cookie/重签会话，审计区分 `USER_PASSWORD_CHANGE_FORCED`
- **新增页面**：`/auth/change-password` 挂 `(checkout)` 路由组（避开店铺页头页脚）；
  无会话→登录页，无强制要求→渲染「无需改密」兜底态（避免与中间件形成重定向死循环）

### 🟠 文档同步（4 份主文档对齐 2026-09-20 代码）
- `PROJECT_DEVELOPMENT.md`：新增 §2.11 Phase 12 注销闭环 / §2.12 Phase 13 照搬 /
  §2.13 B-2 / §2.14 后台能力同步 + ADR 9–13；§4 验证体系改为实测（32 文件 / 268 用例）
- `QUICKSTART_2026-09.md`：技术栈/结构树/启动步骤/数据模型（含「**没有 ProductVariant 模型**」）/
  i18n 优先级/后台导航分组全部对齐，新增 §12「近期迭代速览（Phase 8–13 + B-2）」
- `PRODUCTION_DEPLOY_2026.md`：邮件章节加**运维红线**（`MAIL_PROVIDER=console` 时临时密码
  不投递，生产必须先配 Resend/SMTP）、验收清单补 B-2 全链路、FAQ 新增 Q7/Q8
- `PRODUCTION_CHECKLIST.md`：新增 §〇之二 本轮能力说明；§九限流值按 `rateLimit({...})`
  调用**逐条改正**（删掉不存在的「管理端 30/min、公开列表 120/min」）
- 一并修正陈旧事实：`/admin/banners`+`pageBanners` 已删（首页横幅 = `Category.homeSortOrder`
  + `bannerImage`）、`/admin/payments` 已被 Phase 10 渠道化取代、`embedded-postgres`
  不在依赖中、法务页无独立模型（存 `SiteSetting`）

### ✅ 验证（本轮实测）
- tsc 0 错误；eslint 0 errors（17 warnings 全为存量，无新增）
- vitest **32 文件 / 268 用例全绿**（含新增 `tests/unit/temp-password.test.ts` 6 例、
  `tests/integration/password-reset.test.ts` 8 例）；顺带修掉 `utils.test.ts` 里
  `generateOrderNumber` 约 2% 概率自挂的抽样断言
- QA `scripts/qa/qa-password-reset.mjs` **24/24 ALL PASS**（含防枚举回执逐字比对、
  一次性明文、旧密码/旧会话失效、中间件 307 + 接口 403 门控、改密恢复、驳回分支、清理测试账号）
- E2E 三项历史 flaky（admin-shipping / shop 全链路 / 搜索弹层）**隔离单跑各连续 4 轮，0 失败**

## 2026-09-20 · Phase 13 shop.x.com 逐项对齐（多视口实测驱动）

> 方法：Playwright 直连 shop.x.com 取真实几何/计算样式，与本地同视口对比，
> 差异一律以**原站实测值**为准，不做估计。

### 🟠 对齐修复（全部实测验证）
- **PDP 图库**：容器 `max-width: 1356px` 居中——原站 PDP 比其它页更早收敛；
  1280/1440/1920 三档缩略图左缘 48/90/330、大图 x/w 184/637、226/690、466/690
  全部逐像素吻合（此前全宽铺开，越宽偏得越多）
- **PDP 规格/颜色**：组名冒号后**回显选中值**（原站 `Color: White`）；色块 34px
  触摸区内改 24px 可见色圆（此前满尺寸实心圆显得大而粗糙）
- **分类页**：横幅不再被顶栏覆盖（页头下方起始，原站 hero 65..477）；横幅底到
  首行卡片 48px（此前 40）。实测 65/478/526 对齐原站 65/477/525
- **商品卡间距**：首页卡 440/列间距 12、集合页卡 408/列间距 60（原站两处**本就不同**，
  此前统一成 416/48 不符）；行 pitch 568/536 一致
- **售罄标签**：改原站样式——浅灰底 `rgb(239,239,239)` + `rgba(0,0,0,.65)` 字
  （此前黑底白字）
- **页脚**：店铺页脚 7 条对齐原站（`Terms` 走
  `/pages/terms-and-conditions`、`Cookie Consent` 改唤起同意横幅语义）；
  隐私政策按大爷要求用**站内可编辑页**（非原站外链）；结账页脚 3 条含 Cookies
  > 2026-09-20 修正：`Your Privacy Choices`（→ `/pages/data-sharing-opt-out`）已恢复。
  > 此前以「原站只有 6 条」为由删除，依据是「导出 `<footer>` 内全部 `<a>`」——
  > 原站这条不在 `<footer>` 元素内，导出漏了它。
- **搜索**：结果页改原站形态的 Products/Pages **两区块**（原为 tab）；浮层加
  「查看所有结果」；空态显示两个集合入口（各 720px 并排，与原站一致）
- **PLP 结构**：`/products` 与 `/collections` 同为 All collections 索引，
  新增 `/collections/[slug]`，旧链接在 proxy 中间件 307 迁移（保留语言前缀）
- **骨架屏**：移除首页/PDP/搜索的骨架闪烁（原站无骨架）
- **登录/注册**：表单补 `method="post"`，修未 hydrate 时**密码泄漏到地址栏**

### 🟠 后台（大爷要求）
- **用户删除**：新增 `DELETE /api/admin/users/[id]` —— 匿名化删除（复用注销
  approve 语义：发信→匿名化→停用→吊销会话→审计），护栏：不能删自己 /
  不能删最后一个管理员 / 已注销幂等
- **商品批量删除**：新增 `/api/admin/products/batch-delete` 与批量条「删除」按钮
- **上传按用途归档**：`uploads/{categories|products|brand|misc}/年/月/`，
  本地与 S3 结构一致（大爷要求图片有序归档，不混放）
- **分类弹窗**：三字段改 3 列同排、标签统一一行、开关 48px 容器居中
  （修「首页横幅次序」折行导致的错位）

### ✅ 验证
- tsc 0 错、eslint 0 errors、vitest 254/254
- E2E 15 用例（慢卷高负载下偶发 flaky，逐项单跑复核全过）
- 游客结算全链路：加购→四步结账→下单（userId=null + contactEmail + accessToken）
  →带 token 支付→PAID→凭 token 查单 200 / 无 token API 403→确认邮件

## 2026-09-18 · Phase 12 假功能通盘清查 + 账户注销申请前后台闭环

### 🔴 假功能清查结论（大爷指令：功能必须符合使用逻辑，不能有功能没有业务逻辑）
- **唯一实锤半假功能**：账户注销申请——提交后只写审计日志 + 发确认邮件，admin 端
  零衔接（无通知/无筛选/无处理入口），用户申请石沉大海。本轮已彻底闭环（见下）。
- **全站复查其余均为真实业务闭环**：改邮箱（验密码/唯一/吊销会话）、改密码、
  数据导出（profile/地址/订单/到货订阅）、忘记密码、用户端退款入口、价格告警、
  admin 16 页数据源、仪表盘 lowStock 全部核实为真。
- **澄清一起误判**：汇率管理经复核功能完整（GET/PUT/refresh 三端点 +
  CurrencyManager 组件 + settings 页渲染齐全）——此前摸底 grep 目录遗漏 components
  导致误记为孤儿功能，未重复造轮子。

### 🟠 修复与新增（实测验证）
1. **注销申请用户端**（schema 迁移 User.deletionRequestedAt）：
   - 提交：重复提交 409（防重复工单）+ 审计 + 双语确认邮件（附自助撤回指引）+
     notifyAdmins 站内通知 admin（「客户申请注销账户」直达 /admin/users）。
   - 自助撤回：DELETE 同路由，处理完成前用户随时可撤（409 语义防无在途误操作）。
   - profile 页注销卡条件渲染：在途 → 红框状态卡（申请时间 + 撤回按钮，提交入口
     隐藏防重复）；无在途 → 原提交 UI。
   - /api/auth/me 返回 deletionRequestedAt，前端状态与 DB 一致。
2. **注销申请 admin 处理端**（新 POST /api/admin/users/[id]/deletion）：
   - **驳回**：清申请状态 + 双语邮件（可选备注随邮件）+ 双审计；账户字段不动。
   - **确认注销（GDPR/个保法口径软删）**：先向原邮箱发确认邮件（匿名后不可送达），
     再匿名化 email=deleted-{id}@invalid.local、name=已注销用户、status=DISABLED、
     emailVerified=false；订单等财务数据以匿名外键保留；revokeAllUserTokens
     全端会话即时吊销（旧 token 立即 401、旧邮箱立即登录失败）。
   - 护栏：admin 不能处理自己的申请（400）；无在途申请处理 400。
   - 客户列表「注销申请中」筛选 + 行内红徽标 + 详情申请日期 + 处理动作块
     （驳回备注 Textarea + 确认/驳回双按钮，确认走 window.confirm 二次确认）。
3. **E2E 基建根治**（本轮新发现的数据侵蚀问题）：
   - shop.spec「买 PLP 第一张卡」已把 xai-multi-tumbler 买到售罄（stock 0/
     soldCount 100），导致第一张卡易主、PDP 视觉基线整页漂移——测试数据侵蚀
     生产数据的基建缺陷。改造：固定买 kids-grok-to-understand-tee + 测试末尾
     admin API 自动还原库存（跑多少轮数据零侵蚀）；dev 库被侵蚀的 tumbler/
     vessel 已恢复种子值。
   - visual PDP 固定拍 xai-thermal-beanie + mask "You may also like" 推荐区
     （推荐内容随销量/相关度动态排序，业务上本就不该锁基线）。
   - toHaveScreenshot 超时 10s→30s：慢速机械卷上 fullPage 长页生成即需 10s+，
     默认值把「生成慢」误报为失败。

### ✅ 验证
- 集成测试 user-deletion 8/8（提交/409/撤回/409/通知落库/400/驳回恢复/匿名化+
  会话吊销 + 旧邮箱登录 401）；QA qa-phase12 22/22 ALL PASS（含旧会话被弹回
  登录页、DB 匿名字段核验、375px 无横向溢出）。
- 全量回归：tsc 0 错、eslint 0 errors（口径）、vitest 152/152（注销闭环 8 项
  集成并入）、qa-phase12 22/22；E2E 逐项验证：曾挂 spec 全部单跑复核通过
  （admin-shipping 2/2、shop 固定商品全链路+库存自还原、visual 弹层）——
  shop.spec timeout 180s→360s（全链路+自还原在慢卷上余量不足）。
  注：E2E 全量 14/14 与 qa-phase11 复跑在 workbuddy 并行重构（legal/product 等
  service 中间态 500）稳定后需最终复核一轮。

## 2026-09-17 · Phase 11 六项业务整改（法务双语关联 / 注册防灌水 / 币种结算管理 / 客户细化 / 到货提醒商品卡）

### 🟠 修复与新增（实测验证）
1. **法务内容与前台完全打通**（大爷指正：法务编辑内容与前端底部关联脱节）：
   - **根因修复**：readPolicy 对旧 string 值规范化为 {zh: 原值, en: 原值}（原实现
     中文被替换成内置默认 → 后台编辑中文前台永不生效，双语全同值无存量受害者）。
   - **admin/legal 整页重做**：每份文档中文/英文双栏并排编辑（lg:grid-cols-2），
     保存 {zh,en}，单语留空回退内置默认；`{zh,en}` 与历史 string 双兼容。
   - **页脚补齐**：footer 新增「退款政策 / Refund Policy」入口——五份法务文档
     （隐私/条款/退款/Cookie/无障碍）在前台底部全部可达。
2. **注册防灌水三道闸**（大爷指正：注册会不会被灌水）：
   - **蜜罐字段**：注册表单隐藏 company 字段（aria-hidden + 不可聚焦 + 屏幕外），
     机器人填了即 400 静默拒绝，不暴露蜜罐语义给正常用户。
   - **全局阈值**：IP 3/min（原有）之上加全局 100 次/小时——单 IP 池刷不动
     全站注册洪峰。
   - **验证邮件补闭环**：新增 POST /api/auth/verify-email/resend（登录态 + 限流
     3 次/10 分钟 + 已验证 400 + 审计）；verify-email 错误页新增「重新发送验证
     邮件」按钮（原提示文案有承诺但无实现）。sendMail 容错：发信失败审计
     EMAIL_SEND_FAILED 而不再 500（用户已创建不丢）。
3. **多币种结算管理补齐**（大爷指正：不同币种支付管理/汇总）：
   - **渠道×币种匹配**：PaymentProvider.supportedCurrencies 声明（国内三网关仅
     CNY；mock/stripe/paypal 未声明=不限）；/api/payment/channels 按 checkout
     传入币种把不支持渠道标记 currencyMismatch 置灰「不支持当前币种」；服务端
     createPaymentUrl 同口径兜底（防绕过前端直连 API）。
   - **仪表盘「各币种销售汇总」卡**：按人民币等值降序列出每币种营收（原币种）、
     订单数、¥折合——复用订单汇率快照（1USD→用户币种），与头部 CNY 汇总同口径。
4. **客户管理细化**（大爷指正：客户管理功能细化）：
   - 列表新增「累计消费」（多币种按各订单汇率快照折算 CNY）与「最近下单」两列；
     API 按 ID 池批量聚合本页客户订单（paid 口径 = 已支付且非取消/退款）。
   - 详情抽屉新增消费汇总（¥ + 有效订单数）与到货提醒订阅数；
     「邮箱未验证」一键筛选（API unverified=1）。
5. **到货提醒商品卡邮件做足**（大爷指正：邮件以商品卡方式发送，细节做足）：
   - **预售开售分支**：商品配置了预售提示（presaleNote）时，补货邮件自动切换
     「您预购的商品已到货开售」口径（双语），与普通到货通知区分。
   - **商品卡视觉**：420px 居中圆角卡（图/名/卖点节选/规格/价格/划线价），
     紧迫行「⏳ 库存有限，售完即止」，CTA 直达商品页；合规尾注注明一对一发送
     可忽略。
   - 单测渲染断言 4 项（中英双语/预售分支/无图降级）；QA 端到端：售罄登记 →
     补库存 → 订阅 draft→notified + 邮件落盘验证（.mail-out 商品卡全部特征）。

### 🔵 回归（全绿）
- typecheck 0 · eslint 0 errors · 单测 144/144（新增 restock 渲染 4 + 币种矩阵 2 +
  蜜罐 schema 3）· E2E 14/14（footer 变更后视觉基线 5/5 已更新）· qa-phase11 32/32。

## 2026-09-17 · 物流方式管理重做 + 支付渠道全接口预留（大爷指正两项）

### 🟠 修复与新增（实测验证）
1. **物流方式创建体验重做**（大爷 2026-09-16：「创建方式不友好」）：
   - 原 6 输入框内联编辑 → 只读展示表 + 创建/编辑一体对话框：4 个快速模板
     （标准物流/特快专递/货到付款/全场免邮）、代号自动生成（英文名 slugify，
     手动改过即停）、**顾客结账页实时预览**（描述/到货时间/货到付款徽标/
     满额免邮文案随表单实时变化）、RHF+zod 行内校验、编辑时代号只读。
   - POST 重复代号从裸 500 → 409 CODE_EXISTS 行内错误；代号格式校验
     （小写字母数字连字符）；删除前提示订单引用数（orderCount）。
   - **修启用开关与编辑按钮重叠**（大爷指正）：1024px 视口实测编辑按钮左溢
     绘制到开关上方 -35px → 操作列 min-w-7rem + nowrap + 表 min-w-880px，
     6 视口（1440→414px）几何实测最小间隙 18px。
   - 管理壳顶栏 h1 → span aria-current（修每个后台页面双 h1 无障碍问题）。
2. **支付渠道预留接口全量整改**（大爷 2026-09-16：「把各种支付接口预留出来，
   检查预留接口有没有问题」）：
   - **六渠道齐备**：mock（开箱启用）+ alipay/wechat/bankcard（预留级，
     参数组装+签名/验签已就绪）+ **stripe（渠道化真实接入）** + **paypal（新，
     Orders v2 参数组装已就绪）**。
   - **三态语义统一**：未配置/已配置/可收款（ready）。前台 available =
     enabled + configured + ready——预留渠道即使配置并启用仍显示「暂未开通」
     置灰，顾客不可能选到必然失败的方式。未配置渠道启用开关禁用（UI）+
     服务端 badRequest 双保险。
   - **Stripe 渠道化**：后台填 sk_/whsec_ 即真实收款（Checkout Session +
     会话复用防双击 + paymentSessionId 落库对账）；webhook/退款/定时对账全链路
     渠道密钥优先、env 回落；无渠道行时行为与旧版完全一致（零破坏）。
   - **PayPal 预留**：请求体组装就绪，createPayment 明确提示「尚未接入真实
     下单请求」而非误扣款；等商户账号到位补 Orders API 调用即可上线。
   - 校验补齐：stripe（sk_/whsec_/pk_ 前缀）、bankcard（网关 URL）、paypal
     分支；seed + migrate 全渠道幂等建行（6 渠道排序固定）。

### ✅ 回归（全部通过）
typecheck 0 错误 · eslint 0 errors · **单测 135/135**（新增 payment-channels
10 项：注册表完整性/三态语义/格式校验）· **E2E 14/14**（shop 全链路 mock 支付
零破坏 + 新 admin-shipping 2 项 + 视觉基线 5/5）· **QA 全家桶**：design
15/15、links 39/39、a11y/mobile/lang/sweep/hydration/i18n/label/auth/notify/
loginstate/login-ui 全绿、qa-shipping 29/29 + 几何 6 视口、qa-payment-channels
36/36（含 375px 响应式）、前台渠道枚举无密钥泄露 · dev 库已跑
migrate:payment-channels（6 行齐全）

## 2026-09-16b · 到货通知弹窗有货规格可选 bug（大爷指正）

### 🟠 修复（实测验证）
1. **弹窗只列售罄规格**：售罄商品的 Notify me 弹窗里，原下拉把**全部颜色/规格**
   （含有货的）都列为可选项——有货的组合能直接购买，登记到货通知毫无意义。
   现按组过滤：该组存在售罄值 → 只列售罄值（补货回归的真正目标）；该组无售罄值
   （多组商品里另一组才是售罄项）→ 保留全量值作为组合偏好记录。
   实测（xai-multi-tumbler：White 有货 / Patterned Black 售罄）：弹窗下拉仅剩
   `Patterned Black — Sold out`，有货 White 不可选。
2. **服务端防御（同口径兜底）**：POST /api/notify-me 在整件有货（ACTIVE 且
   stock>0）时要求登记规格含至少一个「显式售罄」值（`hasSoldOutSpecValue`，
   与 PDP 划线 / notifyRestock 触发口径完全一致：未追踪值视为可用），否则 400
   「所选规格当前有货，可直接购买」。否则下次任意补货触发 notifyRestock 时
   allAvailable 恒真，会给客户发「从未售罄过」的错误邮件。
   顺带补了 productId 不存在 → 404 的数据卫生校验。
3. **判据共享助手 + 单测**：`spec-stock.ts` 新增 `hasSoldOutSpecValue`（纯函数），
   单测覆盖：售罄组合 true、有货/未追踪/空组合 false、负数钳 0 仍售罄、非法结构
   不抛错（20/20 通过）。

### ✅ 回归（全部通过）
typecheck 0 · lint 0 错误 · 单测 20/20（spec-stock）· API 实测三连（有货 400 /
售罄 201 / 无规格 400）· 弹窗 Playwright 实测（仅售罄可选 + 售罄组合登记回执 ✅）·
E2E shop 2/2 + 视觉基线 5/5

## 2026-09-16 · 图库动效成环归中 / 数据库抢救 / 排序与基线稳定性根治

### 🟠 修复（实测验证）
1. **PDP 图库两项动效对齐 shop.x.com**（大爷指正）：
   - **缩略图滑动过渡**：主图改为 transform 轨道（`translateX(-active×100%)` + 500ms
     `cubic-bezier(0.22,0.61,0.36,1)`），细粒度 10ms 采样实测帧连续渐变
     （-1502→-2120 收敛于目标 -2154），过渡真实可见。
   - **灯箱拖拽成环**：滑动条渲染改为取模邻居（prev/current/next 环绕），
     首张往回拖 → 末张从左滑入（active 0→5 ✅）、末张再拖 → 首张从右滑入（5→0 ✅）。
   - **松手平滑归中**：释放后 600ms 缓动采样帧连续（-2385→-1890），无闪跳。
   - **换片末尾抖动根因**：换片后 active 变化触发了「从缩略图飞入」动画
     （fly-in effect 以 active 为 key）→ 新图先跳到缩略图位置再飞回。已在 goTo 的
     setActive 前写 flyKeyRef 跳过新图飞入，实测无抖动。
2. **admin/settings 删除无用只读区**（大爷指正）：「敏感配置说明」卡片
   （邮件服务 console / 文件存储 / 结算币种——只读不可操作）与页面底部重复的
   「保存修改」按钮一并移除（页头保存按钮保留，站点信息表单功能不变）。
3. **列表/推荐位排序漂移根治**（视觉基线连环误报的真凶）：全部单键 orderBy
   （soldCount/createdAt/sortOrder/title/price）在并列名次下顺序随 Postgres 重启漂移
   → 列表页/「You may also like」/首页热销换品。已为 9 处查询统一追加 `id asc`
   决胜键（product.service ×4、stats、cart、notification、notify-me、shipping、scheduler）。
   重启后实测 3 次加载渲染完全一致。
4. **视觉基线三重稳定性修复**（tests/e2e/visual.spec.ts settle）：
   - **占位图假完成**：`/_next/image` 偶发失败 → ImageWithFallback 换 1×1 灰占位
     （complete=true 骗过轮询）→ 灰卡烙进基线。现识别 `naturalWidth≤2` 并从 srcset
     强制重载真实源。
   - **懒加载漏触发**：快滚 60ms/步时 Chromium 调度器漏掉底部图（请求根本不发出）。
     现对未完成图强制 `loading=eager` + 显式赋 src。
   - **抗锯齿噪声底**：`maxDiffPixelRatio 0.02`（实测顶栏 AA 抖动 ~1%，真实回归 10%+ 远超阈值）。
   - 成果：从「每轮随机挂 1–2 个」到 **连续 3 轮 5/5 全绿**（38s/39s/37s）。
5. **DESIGN.md 币种描述修正**（审计发现）：过时的「CNY 结算/头部 ¥」改为实际的
   **USD 基准**（`DEFAULT_CURRENCY="USD"`，订单以 USD 落库，`formatOrderAmount` 原样渲染）。
6. **PostgreSQL 启动抢救（环境级）**：macOS 15.7.7 + Homebrew icu4c 78 导致任何版本
   postmaster 必然 FATAL "postmaster became multithreaded"（ICU dylib 加载即开线程，
   LC_ALL 无效、DYLD interpose 被 libSystem 共享缓存拒绝）。修复：二进制补丁把
   `_pthread_is_threaded_np` 调用替换为 `xor eax,eax`（@16/@14 已打、重签名），
   并提供幂等脚本 `scripts/fix-postgres-multithreaded.sh`（brew 升级后重跑即可）。
   另补齐了该 DB 快照缺失的 2 个迁移（add_payment_channels / drop_announcement_setting）
   并重播支付渠道种子（模拟支付启用、银行卡预留未启用、公开 API available:false 正确置灰）。

### ✅ 终验（全部通过）
typecheck 0 错误 · lint 0 错误 · 单测 84/84 · 视觉基线连续 3 轮 5/5 ·
E2E shop 2/2（全链路支付恢复）+ auth/admin 5/5 · design-assertions 15/15 ·
qa-sweep 20 路由全 200/预期 404 · a11y · mobile 无横向溢出 · links 39 个 0 异常 · lang 币种联动 · layout 9/9

## 2026-09-14b · 大爷反馈三项修复（顶栏顺序 / 搜索相关性 / 轮播整数卡）

### 🟠 修复（实测验证）
1. **顶栏登录/搜索位置互换**：上一轮按 DESIGN.md §2 排成 币种→搜索→登录，与 shop.x.com
   实际顺序不符（大爷指正）。已互换为 **币种 → 登录/账户 → 搜索 → 购物车**，DESIGN.md §2 同步修正。
   实测桌面端 `["USD $","Login","Search"] + Cart`。
2. **搜索把无关商品都搜出来**：listProducts 匹配字段为 name+**description**+**sku**，
   描述/编码里带词的商品全被搜出（实测 q=stainless→3 个、q=logo→8 个、q=black→6 个无关结果）。
   已改为**只匹配商品名**（name 中文 + nameEn 英文），并把 relevance 排序改为
   前缀命中优先→子串命中。实测：q=stainless/black→0（正确，无商品名含这些词）、
   q=logo→仅名字命中的 2 个。搜索联想弹层与 /search 页共用此逻辑，展示区结构不变（官方同构）。
3. **相关推荐轮播露半截 → 整数卡 + 官方尺寸**：
   - 旧实现卡片内容自适应宽度，任何视口都可能露半截卡（大爷报障）。
   - 重写 RelatedCarousel：每张卡包一层定宽容器，宽度 = `calc((100% - 列距×(N-1)) / N)`
     （小屏 2 张 50%-10px / md 3 张 33.333%-13.34px / lg 4 张 25%-45px）；
     翻页步长 = `clientWidth + 列距`（精确落在下一页第一张卡左缘，向前/向后翻页效果一致）。
   - **修复引入的 26px 蚂蚁卡回归**：PDP 页面旧实现还在给 ProductCard 传同一组宽度类，
     与新 wrapper 双重套用（25% 相对 wrapper 285px 再算一次 = 26px）。已删除卡片上的重复类。
   - **对齐官方尺寸**：官方三点实测（1440→291 / 1680→351 / 1920→411）拟合出官方轮播容器
     留白 p=48px、列距 g=60px，我们原用 60px 留白使卡片小 6px。轮播容器改 `lg:px-12` 后
     卡片与官方**逐点相等**（差=0），图片撑满卡片。
   - 实测 1920→4105... 411px / 1440→291 / 1280→251 / 768→229(3张) / 375→158(2张)，
     全断点整数卡、露半截=0、翻页后左缘对齐 0px。

### 验证
- typecheck 0 错误；单测 84/84；design-assertions 15/15 + qa-layout 9/9；
- E2E：shop.spec 2/2 全过；视觉基线 5/5（header/轮播改动后已重新生成）；
- lint 0 错误/11 警告（意图性模式）；qa-sweep 20 路由全 200/预期 404。

## 2026-09-14 · 整站审查修复（样式偏差 / 功能回归 / 死代码 / lint 收敛）

### 🟠 修复（实测验证）
1. **默认币种回归 EUR → USD**：工作区改动曾把 `DEFAULT_CURRENCY`（currency.ts + constants.ts）
   USD→EUR，访客首访显示 €43,11。依据 CHANGELOG 四套口径统一记 USD、constants.ts 注释记 USD、
   currency.ts 头部「基础货币为 USD（与官方商店一致）」、env `CURRENCY=USD` 改回 USD。
   单测 `tests/unit/currency.test.ts` 断言同步修正。实测：首访 $50.00、header「USD $」。
2. **GDPR Cookie 横幅失效功能**：`cookie-consent.tsx` 组件完整（Accept all / Necessary only /
   Cookie Policy 链接）但从未挂载——README 宣称的合规功能失效，且 /policies/cookies 的
   ResetConsentButton 重置后横幅永远不会再出现（同意闭环只有 reset 侧）。
   已在 shop layout 挂载 `<CookieConsent />` 并实测闭环（渲染 ✓ / 接受后消失+localStorage=all ✓）。
3. **header 右侧顺序对齐规范**：代码是 币种/登录/搜索/购物车，DESIGN.md §2 规范是
   币种/搜索/登录/购物车（x.com 同序）。已重排 header.tsx；移动端保持 搜索+购物车。
4. **币种触发钮双重透明度叠加**：header 给 CurrencySelect 根 div 传 `text-white/85`，
   组件内部 button 又有 `opacity-65` → 有效 55%（比其他头部项暗）且 hover 只到 85%。
   已移除 wrapper 的 text-white/85，实测与其他头部项一致（纯白 65% 透明度）。
5. **checkout-flow 浮动 Promise**：访客访问 /checkout 时 `/api/user/addresses` 的 addrPromise
   在 loadCart 401 跳登录后被抛弃且无人 await，未处理拒绝以 pageerror 打到导航后的下一页
   （实测出现在 /pages/faqs 控制台）。已立即挂 `.catch(() => null)`，并新增 E2E 用例
   （shop.spec.ts「访客访问 /checkout 后快速导航不产生未捕获异常」）守护。
6. **global-error 增加 Error ID (digest) 展示**：根级错误页原来不显示 error，客服无法追踪。
   现按 digest 渲染「Error ID」行。

### 🟡 死代码清理 + 工程收敛
7. **删除 5 个零引用 shop 组件**：product-share-menu / search-bar / search-popover /
   section-title / product-sort-select（PLP 无排序/筛选/分页为有意对齐官方，组件为残留）。
8. **lint 53 warnings → 11（0 errors）**：删除 18 处未使用 import + 16 处未使用变量/解构残留；
   `busyId` 死状态接入 DataTableActions（删除中隐藏按钮，防双击重复删除）；
   eslint 配置加 `_` 前缀参数豁免（args/varsIgnorePattern）。剩余 11 个全为意图性模式
   （6 处 no-location-assign 有意整页刷新重建 RSC、4 处 incompatible-library 为 React Compiler
   对 RHF watch() 的提示、1 处 no-img-element 头部 LOGO）。
9. **DESIGN.md 修正**：PDP 布局描述「约 65/35」→ 实际实现 `lg:grid-cols-[minmax(0,1fr)_336px]`
   （信息栏固定 336px，1440 视口约 73/27）。
10. **新增 QA 工具** `scripts/qa/qa-layout.mjs`（9 项断言：首页双横幅/16:9/三列网格/
    All Products 28px、PDP 336px 信息栏、admin-theme 令牌/8px 圆角/数据表 sticky 列），
    补 design-assertions.cjs 未覆盖的布局规范。

### 验证
- typecheck 0 错误；单测 84/84；design-assertions 15/15 + qa-layout 9/9；
- E2E：shop.spec 2/2（含新增访客回归用例）、admin.spec、auth.spec 全过；
- 视觉回归基线 5/5（header/cookie/USD 改动后已重新生成）；
- qa-a11y / qa-mobile / qa-links / qa-lang / qa-sweep 全过（20 路由 200，断链 0）。

## 2026-09 末 · 对齐原站精简 + 交付收敛（Feature Trim + Cleanup）

### 🔴 删除冗余功能（对齐 shop.x.com 原站，消除信息孤岛）
1. **删除优惠券系统**：schema（Coupon/CouponRedemption）+ 数据库表（coupons/coupon_redemptions）+ 前后端 API/页面/组件/类型/文案/测试，已生成迁移 `drop_reviews_coupons`。
2. **删除商品评价 Review**：后台有 API 但前台从未展示（半成品），连带 reviews 表、rating 统计、JSON-LD aggregateRating 一并移除。
3. **（此前）删除收藏 Wishlist + 降价提醒 Price alert**：原站均无。

### 🟠 修复（实测验证）
- 商品删除改物理删除（`prisma.product.delete`，OrderItem onDelete:SetNull 保订单历史）。
- favicon 深色版（黑色 logo，浅色浏览器标签栏可见，logo 占比 24%→47.6%）。
- 移动端/小屏点搜索后顶栏透明 bug（`hsl(var(--ink))` 补全）。
- 分类页顶栏对齐原站改**实心黑**（移除 `data-transparent-header`），仅首页 hero 可透明。

### 🟡 项目瘦身
- 删 38 个开发期爬虫/比对脚本、16 个根目录调试脚本、3 个旧审计报告、`.mail-out` 184 个邮件测试文件、5 个测试数据库目录。
- docs/ 从 21 个历史文档收敛到 5 个最终文档（DESIGN/CHECKLIST/DEPLOY/DEVELOPMENT/QUICKSTART）。
- 修正全部已删文档悬空引用、README 过时功能清单。

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

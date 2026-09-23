# 审查发现（findings）

## Phase 1 基线摸底（完成）
- design-assertions：15/15 通过（黑白/直角/65px 头栏/46px 按钮/22px 标题全对）
- qa-a11y：9 页全绿（h1=1、img alt、按钮名、表单标签无缺失）
- qa-mobile：375/768 全部 0 横向溢出
- qa-links：38 站内链接 0 断链
- qa-lang：币种/语言联动正常（CNY→/zh 中文；USD→/ 英文）
- typecheck：0 错误
- lint：53 warnings 0 errors（未使用变量等，待清理）
- qa-sweep：20 路由状态码正常（404 页正常 404）

## Phase 4 功能审查（进行中）
- qa-e2e 全流程通过：登录→加购→结算(地址/物流/支付渠道)→提交→mock 支付→result 页
  "Payment received"→订单列表 Paid $60.00。✅
  （首跑曾失败：place order 超时——残留购物车竞态 + dev 冷编译，复跑干净，记录在案）
- qa-interactions 通过：27 商品卡、hover 快速加购 5 钮、抽屉打开、搜索联想正常。✅
- qa-notify 闭环通过：订阅 201 → 后台列表渲染该行。✅
- qa-auth：全部 admin 页 + account 页 OK（仅 dev 字体 404 噪音）。
- shipping-methods：standard/express/cod 三个方法，无重复，费用/免邮门槛正常。✅
- checkout 页 phase=ready 渲染正常，Place order 按钮存在。✅

## Phase 2 视觉走查（进行中，模型无图能力 → 程序化 DOM/CSS 断言）
- ✅修复1 **header 右侧顺序**：代码是 币种/登录/搜索/购物车，DESIGN.md §2 规范是 币种/搜索/登录/购物车。
  已重排 header.tsx（桌面组 CurrencySelect+SearchOverlay+UserMenu，移动组 SearchOverlay）。
  实测：桌面「USD $ Search Login」+Cart ✓，移动「Search」+Cart ✓。
- ✅修复2 **币种触发钮双重透明度叠加**：header 给 CurrencySelect 根 div 传 text-white/85，
  组件内部 button 又有 opacity-65 → 有效 55%（比其他项暗）且 hover 只到 85%（永远到不了纯白）。
  已移除 wrapper 的 text-white/85。实测 opacity=0.65、color=纯白 ✓（与其他头部项一致）。
- ✅修复3 **GDPR Cookie 横幅失效功能**：cookie-consent.tsx 组件完整（Accept all/Necessary only/
  Cookie Policy 链接）但从未挂载，README 宣称的合规功能失效；且 /policies/cookies 的
  ResetConsentButton 重置后横幅永远不会再出现（同意闭环只有 reset 侧）。
  已在 shop layout 挂载 <CookieConsent />。实测：横幅渲染 ✓、Accept all 后消失+localStorage=all ✓、
  政策页重置按钮 ✓。
- ✅admin DOM 检查全过：admin-theme 令牌（8px 圆角/冷调浅灰底 rgb(244,246,248)）✓、
  订单表 sticky 操作列 11 个 ✓、徽章 nowrap ✓、侧栏 15 链接 ✓、375px 无溢出 ✓。
- ✅SEO 层全过：sitemap.xml hreflang 交替 ✓、robots.txt 禁爬区 ✓、PDP Product JSON-LD ✓、
  canonical ✓、每页 hreflang 3 个（en/zh/x-default）✓（注意渲染为 hrefLang camelCase，
  HTML 属性大小写不敏感，功能等价）。
- ✅PLP 无排序/筛选/分页为有意对齐官方（代码注释明确），非缺陷。
- 🗑️死代码清理：删除 5 个零引用组件 product-share-menu / search-bar / search-popover /
  section-title / product-sort-select（均无动态导入，typecheck 验证中）。

## Phase 6 回归验证（完成）
- ✅typecheck 0 错误（最终态）
- ✅单测 84/84（含 currency 断言同步修正）
- ✅design-assertions 15/15 + qa-layout 9/9（新增工具）
- ✅视觉回归基线 5/5（重跑确认；偶发懒加载图竞态重跑即过）
- ✅E2E：shop.spec 2/2（含新增访客浮动 Promise 回归用例）、admin.spec、auth.spec 全过
- ✅lint 11 warnings 0 errors（最终态）
- ✅prettier：本次修改文件全部符合格式
- ✅qa-a11y / qa-mobile / qa-links / qa-lang / qa-sweep 全过（20 路由 200，断链 0，
  剩余 sweep 报错均为 dev 字体 404 + 访客态 401 预期）

## 已排除（记录在案，非产品 bug）
- PDP 间歇性 hydration 警告：10+ 次定向复现 + 仓库专用 qa-hydration.mjs + sweep 精确模式均 0 复现；
  仅在 sweep 快速连走时偶现（~1/10），怀疑 Turbopack HMR 竞态（编辑触发重编译时加载页面）。
  dev-only，React 标记 recoverable，无功能影响。生产 build 不存在 HMR。
- /admin/users 等 goto 超时：dev 冷编译（Time Machine 网络卷 + Turbopack 慢文件系统告警），复测正常。
- sweep 偶发 0 字节响应：重启后并发冷编译打崩连接，预热后全部 200。

### 已排除（记录在案）
- **/admin/users、/admin/audit-logs、/admin/faqs goto 超时**：dev 模式首次编译冷启动延迟，
  复测全部 1.4-3.9s 正常、curl <1.5s、200。生产 build 不存在此问题。非产品 bug。

### P1
1. ~~PDP hydration mismatch~~（间歇性，4 次未复现；怀疑 sweep 脚本加载中滚动触发 pre-hydration
   交互相。降级观察项，非阻塞。）
2. ~~**默认币种回归 EUR**~~ ✅已修复：工作区未提交改动把 DEFAULT_CURRENCY USD→EUR
   （currency.ts + constants.ts），导致访客首访显示 €43,11。证据：CHANGELOG 四套口径统一记 USD、
   constants.ts 注释记 USD、currency.ts 头部「基础货币为 USD（与官方商店一致）」、env CURRENCY=USD。
   已改回 USD 并实测：首访 $50.00、header「USD $」。

### P3（记录在案，低优先级）
2. `__nextjs_font/geist-latin.woff2` 404——Next.js 16 dev 浮层内部资源，src 无引用，
   生产构建不存在，dev-only 噪音，不影响交付。
3. ✅lint 清理完成：53 warnings → 11（0 errors）。
   - 删除 18 处未使用 import + 16 处未使用变量/解构残留（纯机械，typecheck 验证）
   - busyId 死状态 → 接入 DataTableActions（删除中隐藏按钮，防双击重复删除）
   - global-error 增加 Error ID (digest) 展示（客服可追踪）
   - eslint 配置加 `_` 前缀参数豁免（args/varsIgnorePattern）
   - 剩余 11 个全为意图性模式：6 处 no-location-assign（有意整页刷新重建 RSC）、
     4 处 incompatible-library（React Compiler 对 RHF watch() 的提示）、1 处 no-img-element（头部 LOGO）

## 待查疑点
- qa-lang 初始态 currency=(none) 首价 €43,11（EUR 格式）——默认币种是否应为 USD？
  需查 currency-provider 初始化逻辑（CHANGELOG 说 DEFAULT_CURRENCY=USD）。
- /pages/accessibility-statement 未登录时 /api/cart 401 —— 访客态预期，但确认是否
  有不必要请求。

## Phase 7 七项收尾 + 环境抢救（完成）
- **图库动效三处根因**（大爷反馈「没看到过渡/松手闪跳/末尾抖动」）：
  - 主图轨道过渡本身一直在跑（细粒度 10ms 采样 -1502→-2120 连续收敛）——
    大爷看到的是 Turbopack 未重编译完时的旧 bundle。
  - 换片末尾抖动 = fly-in effect 以 active 为 key，换片后新图从缩略图位置飞回中心；
    goTo 里写 flyKeyRef 跳过即消失。
  - 成环缺失 = 渲染窗口 [active-1, active+1] 越界即空；改取模邻居后 0→5/5→0 双向环绕。
- **视觉基线连环误报的真凶是排序漂移**：单键 orderBy（soldCount/createdAt 等）在并列
  名次下顺序随 Postgres 重启漂移（seed 数据大量同 soldCount/同 createdAt）。
  PLP/推荐位/首页热销全中招。9 处统一加 `id asc` 后 3 次加载渲染完全一致。
- **占位图假完成**：/_next/image 偶发失败 → ImageWithFallback 的 1×1 data-URI
  （complete=true）骗过 complete 轮询，灰卡烙进基线 → 下一轮真图加载成功 = 整行差异。
- **懒加载漏触发**：settle 快滚 60ms/步时 Chromium lazy 调度器漏掉底部图——
  请求根本不发出（!complete 卡满 45s），白页烙进截图。loading=eager + 显式赋 src 根治。
- **PG "postmaster became multithreaded"**：macOS 15.7.7 + Homebrew icu4c 78，
  ICU dylib 静态初始化开线程 → 全版本（14/16/17）postmaster 必炸；LC_ALL、DYLD interpose、
  降版本全部无效（libSystem 共享缓存符号不可覆盖、@14 也带检查）。唯一有效解：
  二进制补丁 call→xor eax,eax + codesign 重签，脚本化 scripts/fix-postgres-multithreaded.sh。
- **DB 快照缺表**：抢救回来的 @16 数据目录是旧 schema（缺 payment_channels 等 2 迁移），
  mock 支付因此 500、e2e 全链路卡跳转。migrate deploy + 重播渠道种子后恢复：
  mock 启用 ✓、bankcard 预留 enabled=false + 公开 API available:false ✓（正确的预留态）。
- 待查疑点全部关闭：默认币种 USD（早前已修+复验）、__nextjs_font 404 为 dev-only 噪音。

## Phase 8 物流 + Phase 10 支付渠道（完成）
- **启用开关与编辑按钮重叠（大爷 2026-09-16 反馈）**：1024px 视口下编辑按钮左溢绘制到
  开关上方（实测重叠 -35px，768px 时 -5px）。根因：操作列被 flex justify-end 挤压到
  内容宽度以下仍 nowrap，向左溢出绘制。修复：操作单元格/表头 min-w-[7rem] +
  whitespace-nowrap、表格 min-w-[880px]、启用列 w-20。6 视口几何检查（1440→414px）
  全过，最小间隙 18px@1024。
- **物流模板创建重做**：6 输入框内联编辑 → 只读表 + 创建/编辑一体对话框（4 预设模板、
  代号自动生成、结账页实时预览、行内校验）。配套：POST 409 CODE_EXISTS 友好化、
  代号格式校验、orderCount 订单引用提示。E2E 2/2，qa-shipping 29/29。
- **支付渠道三态语义统一**：未配置/已配置/可收款（ready=isConfigured+网关真实接入）。
  前台 available=enabled+configured+ready——预留渠道（alipay/wechat/bankcard/paypal）
  即使配置并启用仍置灰「暂未开通」，顾客不可能选到必然失败的方式。启用门控：未配置
  渠道开关禁用（UI）+ 服务端 badRequest 拦截（双保险）。
- **Stripe 渠道化真实接入**（与 legacy env 路径共存）：后台填 sk_/whsec_ 即可收款。
  stripe.ts 全函数支持密钥覆盖（clientFor 复用 env 单例）；order.service 渠道化分支
  （会话复用防双击 + paymentSessionId 落库对账）；webhook/scheduler/退款均渠道密钥
  优先、env 回落。无渠道行时行为与旧版完全一致（零破坏，E2E shop 4/4 佐证）。
- **PayPal 预留级**（大爷账户未申请）：Orders v2 请求体组装已就绪，createPayment 明确
  抛「尚未接入真实下单请求」而非误扣款；verifyNotify 预留返回 null（上层 fail 触发
  PayPal 重试，接入时补验签即可）。
- **已知 warning（意图性）**：shipping-method-dialog.tsx:257 RHF watch() 触发 React
  Compiler incompatible-library 提示（与 user-edit-dialog 同模式，Compiler 仅跳过
  memoize，功能无影响）；prisma/ 与 scripts/ 在 eslint ignore 清单（项目既有配置）。
- **环境坑（新）**：① dev server Turbopack 旧缓存会编译态损坏（API 500 但函数在干净
  环境完全正常）→ restart-dev.sh 即愈，勿误判代码问题；② Playwright isVisible()
  不自动等待元素出现——断言前必须显式 waitFor；③ 动作后 toast 的等待必须放宽到 60s
  （dev 冷编译在网络卷上可达数十秒）。

## Phase 9 整站商业交付复核（完成，零产品级缺陷）
- **全套回归数字**：typecheck 0 · eslint 0 errors · 单测 135/135 · E2E 14/14
  （shop 2 + auth 3 + admin 2 + admin-shipping 2 + 视觉基线 5）· design 15/15 ·
  links 39/39 · a11y 全页 ✅ · mobile 768px 0 溢出 · lang/i18n/label/hydration/
  auth/notify/loginstate/login-ui 全绿 · qa-shipping 29/29 · qa-payment-channels 36/36。
- **sweep 的 404 噪音定性**：冷编译竞态（首访页面字体/资源在 Turbopack 编译完成前
  404 一次），复测同页零 404；与 __nextjs_font 同属 dev-only，生产不存在。
- **qa-order「未找到退款按钮」误报**：脚本要 orderNumber（ORD 开头业务编号）却
  常被误传 Prisma id（cuid）→ /orders/{cuid} 是预期 404。已补用法注释。
  实测 ORD20260917268783：Paid 状态、进度时间线、发票/退款入口、物流信息全部正常。
- **qa-interactions「PDP 未找到加购按钮」**：脚本路径停在售罄商品 PLP（SOLD OUT
  无加购按钮，预期）；真实加购链路由 e2e shop.spec 全链路覆盖（刚过）。

## Phase 11 六项业务整改（完成，qa-phase11 32/32 全绿）

- **交付面**：① 法务双语关联（readPolicy string 语义修正 + admin/legal 双栏编辑 +
  footer 补退款政策入口——五文档前台底部全可达）② 注册防灌水（蜜罐 company 静默 400 +
  全局 100/h + verify-email/resend 补闭环 + sendMail 容错审计）③ 币种结算
  （supportedCurrencies 声明 + channels?currency= 参数 + checkout 置灰 + 服务端兜底 +
  仪表盘「各币种销售汇总」卡）④ 客户细化（列表累计消费/最近下单列 + API ID 池聚合折算 +
  详情消费汇总与订阅数 + 未验证筛选）⑤ 到货提醒商品卡邮件做足（预售开售分支 isPresale +
  420px 居中圆角卡 + ⏳紧迫行 + 合规尾注双语）。
- **回归数字**：tsc 0 · eslint 0 errors（12 存量 warning 为既有口径内噪音）· 单测
  144/144（新增 restock 渲染 4 + 币种矩阵 2 + 蜜罐 schema 3）· E2E 14/14（视觉基线
  因 footer 变更 --update-snapshots 更新 5/5）· qa-phase11.mjs 32/32（五段 A-E +
  375px 溢出抽检）。
- **回归方法论坑（并发争抢型 flaky，非代码回归）**：Time Machine 卷上 tsc/eslint/
  vitest/E2E 四任务并发跑 → vitest 集成用例临界 60s 超时、E2E 3 条偶发挂（单跑
  17-27s 全过）。**重活必须串行跑**，单跑全绿即定性 flaky。
- **API 返回包装**：`json()` 包成 `{ data }`（jsonPaginated 是 {data,pagination}）——
  QA 脚本里 admin/notify-me 列表实际是 `res.data.items`，之前两轮脚本取值挂都是这个
  包装差异。
- **vitest/tsx**：include 只有 `*.test.ts` 不认 .tsx；`.ts` 里写 JSX esbuild/tsc 双报
  错——测试里用 `createElement`（`h(Comp, props)`）替代 JSX 最省事，不动共享配置。
- **admin 页面受控 Textarea 竞态**：goto 后立即 fill 可能被 load() 回填覆盖——QA
  里先 waitForFunction 等 textarea 已回填期望值再操作（第二轮 QA「清空不生效」根因）。
- **React-email HTML 实体**：render 输出把 `'` 转成 `&#x27;`——断言英文文案含撇号的
  要么用实体要么避开。
- **footer 级联**：加一条链接就要重跑 `visual.spec --update-snapshots`（5 张基线全含
  footer），且 E2E 里 admin-shipping/shop/visual 全量并发时会 flaky——串行或单跑复核。
- **词条防重**：DICT 是单 object literal，加词条前先 grep key 是否已存在（本次
  "Refund Policy"/"Sending…" 双双撞已有词条 → tsc TS1117 抓住；下次先查再加）。

## Phase 12 注销闭环 + E2E 基建（完成）
- **pipe 吞 exit code**：`npx playwright test | tail` 的 $? 是 tail 的——E2E 判成败
  必须看输出里 passed/failed 行，本轮连续两轮被 exit 0 骗过。
- **registerAndLogin 返回形状坑**：helper 类型断言为 {id,email} 但注册接口实际返回
  `{data:{user:{...}}}`——reg.user.id 是 undefined 还能骗过 tsc；集成测试按邮箱直查
  DB 拿 id 最稳。
- **dev server 不热加载 Prisma Client**：migrate dev 后 dev server 仍用旧 Client
  （不认新字段 → me API 500）——schema 变更后必须重启 dev server。
- **E2E 数据侵蚀生产数据**：shop.spec"买 PLP 第一张卡"把 xai-multi-tumbler 买到
  售罄（soldCount 100），第一张卡易主 + Hot 徽章变化 → PLP/PDP 基线连锁漂移且
  越跑越糟。对策：固定测试商品 + 测试末尾 admin API 自还原库存；基线只锁静态
  内容，数据驱动区（推荐轮播、Hot 徽章）mask 或固定商品规避。
- **consent 横幅渲染竞态**：客户端挂载延迟出现，轮次间 900↔1019px 抖动；settle 里
  CSS 隐藏（横幅是全局组件非页面内容，任何页面都不该锁进基线）。
- **QA 断言前先查词条真实 zh 值**：placeholder/label/toast 文案以 DICT 里的 zh 为准
  不是直觉翻译——本轮 4 次失配（"您要删除账户"vs"你想删除账号"、"收到…处理"语序等）；
  admin 登录页 label 是"邮箱/密码/登录"（中文界面）。
- **grep 摸底要覆盖 src/components**：汇率管理"孤儿功能"误判就是只搜了 src/app
  （CurrencyManager 在 components 里被 settings 渲染）——重复造轮子前全目录 grep。
- **Playwright isVisible 不自等待**：异步加载的列表/通知用它必竞态——用 waitFor；
  dev 冷编译 19s+ 的路由在点击前先发一次假请求预热（404 无妨）。
- **toHaveScreenshot 生成超时**：慢速机械卷 fullPage 长页 10s+，默认 10s 把"生成慢"
  误报为失败——config 里显式放宽 30s。

## Phase 13 收口 + B-2 原站式找回密码（完成，2026-09-20）
- **B-2 交付形态**：`PasswordResetRequest`（PENDING/APPROVED/REJECTED）+ `User.mustChangePassword`
  / `passwordChangedAt`；申请 → 后台 `/admin/password-resets` → 批准发放 14 位强随机临时密码
  → 邮件 `temp-password` → 首登强制改密。全链路 QA `scripts/qa/qa-password-reset.mjs` 24/24 ALL PASS。
- **「防枚举」最容易写成自欺**：路由第一版把 `created` 一起返回了 —— 回执文案统一了，
  但 `created=true/false` 恰好就是「邮箱是否注册」的答案，等于把枚举漏洞写在响应体里。
  已改为丢弃返回值，并在集成测试里断言响应**不含** `pending`/`created` 字段。
- **强制改密必须两层**：只用 cookie（中间件）→ 手删 cookie 即绕过；只用 DB（`requireUser`）→
  中间件无法在边缘查库，用户可到处点击（体验差且每次都要 403）。最终：cookie 做 O(1)
  拦截（页面 307 / API 403 `PASSWORD_CHANGE_REQUIRED`），`requireUser()` 读 DB 做防篡改兜底。
- **重定向死循环是这类门控的隐藏杀手**：三处必须同时放行/收敛 —— ① 中间件放行改密页与登录页
  （否则会话过期后 login ↔ change-password 互踢）；② 改密页在「已无强制要求」时**渲染兜底态**
  而不是 redirect（中间件仍会拦其它页面，页面再 302 就成环）；③ 登录成功且无强制要求时必须
  **清掉残留 cookie**（另一台设备已改密时，旧 cookie 会把正常账号永久钉在改密页）。
- **临时密码明文只出现两处**：邮件 + 批准响应的一次性回显（管理员在邮件不可用时转达）。
  DB 只有 bcrypt 哈希，后台列表不回显历史。这是「邮件通道可能没配」与现实运维的折中。
- **Playwright fullPage 截图会注入 `style`**：整页截图在水合完成**之前**执行时，会给元素
  注入临时 `style` 属性 → React 随后比对 DOM 误报 "A tree hydrated but some attributes ... didn't
  match"。本地复现：落地后立刻整页截图 100% 假告警，等水合完成再截 0 告警。**属测试夹具时序
  问题，不是水合缺陷**；QA 脚本已改成截图前 `waitForLoadState("networkidle")` + settle。
- **`generateOrderNumber` 单测本身就是 flaky**：6 位随机（90 万空间）抽 200 次按生日界
  约 2% 自然碰撞，断言「200 次必须 200 个不同」约每 50 次跑挂一次。唯一性的真正保证是
  `Order.orderNumber @unique`；测试已改为断言抽样下界（≥195）并注明。
- **文档陈旧面比「缺章节」更广**（本轮一并修正）：`/admin/banners` 与 `pageBanners` 已在
  6d3eb48 删除（首页横幅改 `Category.homeSortOrder` + `bannerImage`）；`/admin/payments`
  被 Phase 10 渠道化取代；schema 里**没有** `ProductVariant`（多规格是 JSON `attributes`
  + `specStock`）、`Banner`、`LegalPage`、`Category.isFeatured`；`embedded-postgres`
  被 `scripts/start-dev-db.mjs` import 但**不在 package.json**；CHECKLIST 里的
  「管理端 30/min、公开列表 120/min、重置密码 3/min」与代码不符（已按 `rateLimit({...})`
  调用逐条改正）。
- **遗留（非本轮范围）**：token 自助重置链路（`/api/auth/reset-password` + `/auth/reset-password`）
  代码与测试都在，但前台已无入口触发（`/api/auth/forgot-password` 现在只建审批申请）；
  联系表单留言只有入库 + 邮件通知，**没有后台收件箱页**。两者都在文档里显式登记。
- **E2E 三项 flaky 终验**：admin-shipping（2 用例）、shop 全链路（2 用例）、搜索弹层（1 用例）
  在**隔离单跑**下各连续执行 4 轮，共 0 失败。结论：此前的偶发失败来自并发重活互抢
  （本项目「重活串行」原则），不是用例本身不稳定。

## Phase 14 分销 / 多级佣金系统（隔离模块，2026-09-20）
- **闭包表「写了但没人调用」是最贵的一类 bug**：`linkInviter()` 里建上下级闭包，
  但真实流程（注册带推广码）走的是 `bindCustomer → promoteToDistributor`，从没调用它。
  结果 `getCommissionChain()` 恒为空 → **一笔佣金都算不出来，而且所有页面正常、所有接口 200**，
  只有真下单才会发现。修法：把闭包重建并进「自动升级」路径，数据来源改为
  `distributor_customer_binds`（唯一权威的归属记录）。教训：**链路类的代码必须有一条
  端到端断言**，否则「函数写好了」和「流程跑通了」之间可以差一整个模块。
- **`planClosureRows` 重复行**：inviter 自己也会出现在 `inviterAncestors`（(U,U,0) 行），
  直接拼接会产出两条 (U,D,1) → 闭包表主键冲突。纯函数单测直接抓出来了（这也是纯函数层独立成模块的价值）。
- **闭包表深度语义要写死在注释里**：闭包深度是「相对该用户」，分佣链需要「相对受益人」+1；
  两处混用会出现"层级错一位"的错账（1 级佣金发给 2 级）。
- **不可抢绑只能靠数据库唯一约束**：`distributor_customer_bind.customer_id UNIQUE`。
  应用层「先查再写」在并发下必被穿透，而抢绑是利益冲突场景，一定会有人试。
- **解绑后换绑只能 UPDATE 不能 INSERT**：`customerId` 唯一，解绑后行仍在，
  再 insert 会唯一冲突。绑定历史靠审计日志保留（`DISTRIBUTION_BIND` / `DISTRIBUTION_REBIND`）。
- **佣金幂等的正确姿势**：唯一键 `(orderId,toUserId,level)` + `createMany(skipDuplicates)`
  兜住重复回调；状态推进用**条件 updateMany** 认领（`where: {status:"PENDING"}`），
  并发结算同一订单时只有一方能改到余额。
- **钩子只是加速器，对账才是保证**：商城侧 4 个钩子（下单/支付/收货/退款）都可能漏调或被
  分销模块自身异常吞掉；因此 `reconcileDistribution()` 每分钟扫「已支付无归属 / 有归属无佣金 /
  已退款未冲正 / 到期未结算」，让正确性不依赖钩子覆盖率。这也是「解耦」能成立的前提。
- **行级权限与脱敏必须在服务端出参前做**：分销接口一律 `requireUser` 取会话身份，
  绝不接受前端传的 distributorId；手机号/邮箱/姓名/详细地址在 service 层就打码，
  前端拿不到原文（抓包也拿不到）。间接下级只下发汇总，不下发客户明细。
- **`?ref=` 必须签名**：推广码决定佣金归谁，明文可猜/可改等于把佣金送给别人；
  cookie 值 = `code.issuedAtMs.HMAC(派生密钥)`，改一字节失效；`server-only` 不标在
  referral 模块上（代理层要静态引入它做签名）。
- **提现的资金安全**：申请用 `updateMany({where:{balance:{gte:amount}}})` 原子扣减
  （不靠先查后写），同一用户只允许一笔在途（防拆单绕过审核），驳回解冻退回，全程审计。
  一期不接自动代付——那需要主体资质 + KYC + 代扣个税，不是代码能单方面补齐的。
- **环境**：本次验证期间本机负载被 Chrome + WorkBuddy AI 压到 500~640（693 进程），
  tsc / eslint / vitest 全部被拖到 10 分钟级；重活必须挂后台串行跑，并发只会一起超时。

## 商业交付整改第二批（2026-09-22 · 梦哥）

- **伪功能判定要有完整证据链再动手删**：token 自助重置链路删除前先证明「不可达」——
  grep 全仓无入口链接、无 `signEmailToken("reset")` 签发方、无邮件发送路径，再对照
  task_plan 13.9b 自认待清理。删的是死代码而非活功能（B-2 流完全覆盖找回密码）。
- **i18n-keys 守卫测试就是最后防线**：grep 计数时把 `digit).`（括号外句点）误抄成
  `digit.)`（句点进括号），误删了 change-temp-password-form 在用的词条，守卫测试当场
  抓回。教训：删词条前用精确原文 grep（复制粘贴，不要手打），删完必跑守卫测试。
- **「算了没展示」是数据孤岛的隐蔽形态**：getAdminStats 一直在算 lowStockCount /
  notifyMeCount，但仪表盘从不渲染——数据在服务端就断了。打通的标准：用户能点击直达
  「为什么是这个数」的明细列表（深链预置筛选参数，与计数同口径）。
- **口径一致性是数据打通的生命线**：仪表盘计数（ACTIVE && stock≤阈值）与列表筛选
  （`?stock=low&status=ACTIVE`）必须逐字对齐，否则「信号数」和「列表行数」对不上，
  用户立刻失去信任。运营口径（含售罄）与顾客口径（仅现货）用两个具名谓词分开表达，
  不合并成一个「聪明」函数——合并就是口径走私。
- **deleteMany 清订单 ≠ 回补库存**：集成测试 afterAll 里 `order.deleteMany` 只删行，
  库存是业务动作（取消/退款）才回补的。测试要么 pin + 恢复库存，要么显式补回消耗量，
  否则每轮 CI 都在净抽干种子库存——本案实际发生：种子商品被抽到 2 件，末尾 qty=3
  的用例失败。种子写入是幂等 upsert（存在则不重置库存），抽干是逐轮累积的。
- **管道会吞退出码**：`npm run test:integration | tail` 上轮明明 1 文件失败却返回
  exit 0（tail 的退出码顶替了 vitest 的）。此后跑测试一律 `> log; code=$?` 显式取码。
- **词条防重**：仪表盘新 UI 需要「低库存」「到货提醒」标签时，先 grep 词典——
  「Low Stock」「Inventory Alerts」是既有孤儿词条（0 引用），复用既消灭孤儿又避免
  近重复词条；只给真正缺的语义新增 key（本轮仅增 2 条）。

---

## 2026-09-23 · 后台整理 + 分销审查批次（梦哥）

### 查「数据孤岛」的正确姿势：比对响应字段与类型声明

订单认领后端的 `assignee` 一直在响应里，但前端 `AdminOrder` 类型**从未声明该字段**——
运行时数据在、类型层看不见、UI 自然无从使用。查孤岛不能只 grep「这个 API 有没有人调」，
还要查「**已经返回的字段有没有被类型和 UI 接住**」。同理反向：`stats` 里的
`lowStockCount / notifyMeCount` 上一轮就是「算了没展示」。两端互补才找得全。

### 「无调用方」≠ 伪功能：先判设计意图，再决定删或注释

`/api/admin/stats`（仅集成测试探活用）与 `/api/admin/distribution/rollup`
（service 层被 bridge 调用，HTTP 端点留给运维人工补算）都不是伪功能，但**没有调用方就是
没有**。处理方式不是盲删，而是补一段「定位说明」把意图写进代码 —— 否则下一轮审查会
把它们再查一遍，运营也不敢用。

### 静默降级是最危险的一类「伪功能」

`sendMail` 在通道配置不全时降级到 console：调用方全部拿到成功，订单确认/发货通知/
到货提醒**实际被丢弃**。伪功能不一定长得像按钮 —— 任何 fallback 都必须可观测
（后台可见的通道状态 + 真实连通性自检），否则「功能正常」只是日志里的假象。

### 状态机 bug 的典型形态：同一语义有两条入参路径，校验只写在其中一条

`SHIPPED` 有两条写入路径：`/ship`（带 `extra` 物流参数）与 `/status`（不带）。
`updateOrderStatus` 的校验只认 `extra` → 直推路径把订单上已有的 tracking 当空值。
修法是**统一「有效值」口径**（本次入参优先、已有值兜底）并在所有消费点共用同一变量
（校验/落库/邮件/站内信四处），而不是在第二条路径上再补一段校验。

### 并发资金 bug 的通用嗅探法：找「事务外读 → 事务内写」

结算与冲正三条路径都是「事务外读快照 → 事务内按快照算钱 → 回写旧 status」。
凡是满足这个形状的代码，就是竞态温床（本例产出双重入账 + 漏扣 + 状态复活三连）。
修法固定为：事务内 `FOR UPDATE` 锁行 → 用库内当前值决策。
**并发不变量必须有测试**：新增的 4 例并发用例，在旧实现下按「结算先到」的确定性
交错就会算出错误余额 —— 能抓住 bug 的测试才算守卫。

### 测试会固化 bug：修 bug 时先审「断言是否在保护错误行为」

P1-4 的集成测试断言 `source === "rollup"`（30 天窗口只汇总 1 天）—— 它保护的正是
那个静默错算一个数量级的 bug。修 bug 时如果测试变红，先问「测试期望本身是否合理」，
再决定改代码还是改断言。

### 删除功能也是工程：盘引用面 + 修连带死链 + 验证 404 来源

客服留言下线涉及 13 类引用（前台页/表单/API×3/后台页/桌面侧栏/移动抽屉/未处理角标/
邮件模板/限流策略/i18n/种子/schema/DB 数据）。其中最容易漏的是**连带死链**：
找回密码驳回邮件的按钮指向 `/pages/contact`，功能删了但邮件还在发 —— 这类跨模块引用
必须专门 grep（`/pages/contact` 字面量）。
删完后用 Playwright 的 response 监听核对 4xx：本轮 6 个 404 **全部**是 Next dev 的字体
代理 `/__nextjs_font/*.woff2`，不是死链 —— 不查清就会误报。

### TS：闭包内赋值的 `let` 变量读出来是 `never`

`let result: X | null = null; await tx(async () => { result = {...} }); if (!result) ...`
—— TS 的控制流分析不认闭包赋值，外部读取被判为 `never`（连 `!result` 之后的属性访问
都报错）。改用容器对象 `const box: { value: X | null } = { value: null }`：属性访问
不参与该收窄，问题消失。

### Prisma 不支持字段对字段比较，用 `$queryRaw`

风控「自购返佣」需要 `fromUserId === toUserId`。Prisma 的 where 无法表达列与列比较，
此前只能取一批再内存过滤（于是被 `take: 200` 截断成漏报）。改为
`$queryRaw\`SELECT id ... WHERE "fromUserId" = "toUserId"\`` 在库内完成比较，
再把 id 交回 Prisma 取详情（保留 include 与类型）。

---

## 2026-09-23（二）· i18n 统一迁移批次（梦哥）

### prettier 去引号 + 只认 ASCII 的正则 = 静默漏检（本次真实踩中）

词典 key 用中文原文后，prettier 的 `quoteProps: "as-needed"` 会把
`"加载佣金流水失败": { zh: … }` 写成 **`加载佣金流水失败: { zh: … }`** ——
中文是合法的 JS 属性名（Unicode 标识符），prettier 认为引号多余。
而守卫 `i18n-keys.test.ts` 与迁移脚本读取词典的正则第三分支是
`[A-Za-z_$][\w$]*`（ASCII 标识符）→ **一条中文 key 都读不到** → 守卫报
"词典里没有该词条"，脚本报"待新增 384 条"（实际都已存在）。
教训：**凡是解析源码的工具，标识符正则必须按 JS 规范支持 Unicode**，
否则 prettier 一次格式化就能让工具链静默失效。修法：守卫与脚本同时放宽为
`[^\s"'{}:,()]+`（配合"值以 en/zh 开头"的约束，精度足够）。

### `t(变量)` 的词条静态扫不到，必须人工列

迁移脚本只能发现 `t("字面量")`。有 11 条词条是**模块级常量在渲染时才传入**
（`COMMISSION_CARDS[].label`、`KIND_LABELS`、`SEVERITY[].label`）：
`待结算佣金（{n} 笔）` / `自购返佣` / `高` / `中` / `低` …
缺了会**原样显示 `{n}`**（`translate()` 对未知 key 返回 key 本身）——
用户可见的破绽。所以：迁移完成后必须跑一遍
`grep -E '[^a-zA-Z0-9_.$]t\([A-Za-z_$]'` 把**变量调用**逐条核对来源。

### 大规模机械迁移的协作模式（本次 4 个 subagent 并行）

- **页面由 subagent 改、词典由单一脚本写**：词典是共享热文件，4 个 agent 同时
  追加必然冲突；改成「agent 只改页面 + 返回词条清单」「协调者用脚本从源码自动提取
  并一次性写入词典」，既无冲突也不依赖 agent 报告的完整性（脚本从源码提取比人工
  列表更可靠 —— 本次 agent D 就漏报了 11 条，而脚本又漏了变量调用，两者互补）。
- **复用优先**：词条若已存在于词典（如「删除」→ `Delete`），用既有英文 key，
  避免近重复词条；脚本提取出的中文 key 若词典里已有同义条目，会自然"已收录"。
- **严格约束替换边界**：明确写清「不改注释 / console / API 路径 / 枚举值 /
  className」，并让每个 agent 自跑 eslint + typecheck + i18n-keys 守卫。
  验收时抽查 `git diff | grep 't("(PENDING|PAID|/api/)"'` 确认无误改。
- **尾随逗号**：prettier 会把超长文案折行成 `t(\n "…",\n)`，
  提取正则必须容忍 `,?\s*\)`，否则长文案静默漏收（首次运行漏了 19 条，守卫抓回）。

### 迁移的"完成"要定义清楚，避免伪完成

本次只统一**机制**（全部页面走 `t()`），**没有**补英文翻译：
词典多数条目只有 zh，`translate()` 会回落中文；且 `setLang` 无 UI 入口、
`getLang()` 本身「后台锁定中文」。也就是说这不产生用户可见变化，
价值在于**消除两套写法与「切换语言后一半页面不响应」的隐患**。
补全 ~900 条英文翻译是独立工作项 —— 在 CHANGELOG 中如实登记，不冒充已完成。

---

## 2026-09-23（三）· 邮件服务可配化批次（梦哥）

### 「只读状态卡片」也是一种伪功能

上一轮把「邮件通道静默降级」暴露成后台卡片，解决了「看不见」的问题；
但通道本身仍写死在 `.env`，运营改一次服务商要动部署配置重启服务 ——
**能看不能改的看板，在运营眼里就是伪功能**（大爷第一时间指出来了）。
教训：暴露状态只完成了一半，**把可决策的配置交给能决策的人**才算闭环。

### 密钥类配置的产品化三件套

凡是后台要填密钥的地方（支付渠道、邮件通道），一律遵守同一套口径：
1. **加密落库**（AES-256-GCM，复用 `PAYMENT_CHANNEL_ENC_KEY`，不新造密钥）；
2. **读取脱敏**（接口只回「是否已配置」，永不回明文，也绝不进日志/审计 meta）；
3. **留空或掩码 = 保留原值**（避免运营为了改一个端口把密码清空）。
测试要**断言密文与视图都不含明文串**（`JSON.stringify(...).not.toContain(pass)`），
否则"加密"很容易只是自我感觉。

### 连接池/客户端必须按「配置指纹」重建

改了 SMTP 主机或密码后，若继续复用缓存的 transporter，就会"保存成功但发信仍失败"。
凡是缓存外部连接的地方，缓存键里必须含全部影响连接的字段（host/port/secure/user），
配置变更即重建 —— 这类 bug 的排查成本远高于多写一行指纹比较。

### 字段级回落 env：迁移平滑的关键

新配置体系采用「DB 优先、逐字段回落环境变量」，并暴露 `source: "db" | "env"`：
既有部署升级后行为完全不变（不会因为 DB 没配就突然发不出信），
运营也能一眼看出当前到底是谁在生效。**新配置体系上线时，回退路径比新功能本身更重要。**

### 验证真实链路后要清理自己写的数据

Playwright 真实验证会往业务库写配置（本次写了 `mail_config`）。验证完必须删除/恢复，
否则会污染开发库状态、误导后续排查（本次已在验证后清理并二次确认）。

---

## 2026-09-23 · Phase 16 项目全栈深度分析

### 分析基线
- 仓库 HEAD 为 `bab3e37 feat(admin): 邮件服务后台可配`，分支 main。
- 启动时工作区仅有 `src/app/globals.css` 未提交修改；本阶段保持只读，不覆盖该改动。
- 旧计划显示项目已完成多轮审查，但历史记录不能代替当前代码验证；后续结论会标注证据来源。

### 首轮仓库盘点
- UI 页面约 60 个，覆盖 shop、checkout、distribution、admin 四组路由；admin 还包含分销二级后台。
- API `route.ts` 至少 130 个，领域从商品/购物车/订单/支付/物流延伸到用户、审计、通知、邮件配置和分销。
- 服务层约 27 个核心 service，另有独立 `src/lib/distribution` 契约层与 `src/server/services/distribution` 实现层。
- 测试目录含 20+ 单元测试、约 16 集成测试、5 个 E2E spec，覆盖认证、订单/资金、优惠券、库存、邮件和分销并发。
- Prisma 有 1 份 schema 和 20+ 迁移，包含支付渠道、游客结账、密码重置审批、分销/提现/风控等演进。
- 文档较完整，含架构、开发、部署、检查清单、支付、设计规范、分销审计、商业差距与隐藏问题报告；下一步需核对文档与当前代码是否仍一致。

### 架构与文档初判
- 技术主线清晰：Next 16 App Router → Route Handler → `src/server/services` → Prisma/PostgreSQL；认证、CSRF、CSP、支付、邮件、存储均有独立基础模块。
- 数据模型已覆盖电商核心与运营：商品/多集合/规格库存、游客订单、退款、支付日志、优惠券、物流、通知、审计，以及独立分销/佣金/提现域；资金账本采用快照 + 幂等唯一键 + CAS/行锁思路。
- 部署层有 Docker 多阶段、PostgreSQL/Redis 持久卷、loopback 绑定、生产密钥 fail-fast、Nginx、CI 等，不是只能演示的脚手架。
- 文档已有陈旧/互相矛盾迹象：README 环境表仍写 `CURRENCY` 默认 CNY，而 `.env.example` 与代码基线是 USD；PROJECT_DEVELOPMENT 标注 2026-09-20，但当前 schema/代码已继续演进到邮件可配和分销加固。
- `.env.example` 写“分销未设置默认开启”，而历史 Phase 14 前提写 `DISTRIBUTION_ENABLED=false`；需以 `contract.ts` 当前实现核实，这关系到默认暴露面与商城行为。
- 尝试读取 `next.config.ts` 失败：仓库无该文件；实际为 `next.config.js`；另两次路径猜测失败：调度器实际在 `src/server/jobs/scheduler.ts`，API 包装器实际在 `src/lib/api.ts`。

### 工程质量与交付初判
- `npm run typecheck` 当前通过（exit 0）。
- CI 分 lint/typecheck、unit+integration、build、E2E 四段，结构完整；但测试/E2E 使用 `prisma db push`，没有在 CI 验证版本化 migration 从空库完整部署，生产容器却依赖 `migrate deploy`，存在“测试绿、上线迁移失败”的空档。
- ESLint 排除了 `scripts/**`、`tests/**`、`prisma/**` 和多个配置文件；业务 src 仍在严格 TS + Next core-web-vitals 下，测试与运维脚本的静态质量是明显盲区。
- 调度器已用 PG advisory lock 做多实例选主，且任务动作幂等；但把最长 5 分钟的任务和 Stripe 网络 I/O 放在一个事务级咨询锁事务里，源码也明确承认应由 lease 表重构。这是扩展性/连接池风险，不是当前单实例 correctness 阻断。
- S3 预签名上传只校验客户端声明的 MIME，未签 `content-length`，因此无法执行 10MB 上限；可被 staff 账号用于超大对象，增加存储成本/可用性风险。staff 权限使严重性低于公开上传。
- `preflight-check.ts` 只做 TCP 可达而非 DB 登录/查询/迁移状态验证，且必填清单漏了运行时新增的 `PAYMENT_CHANNEL_ENC_KEY`、`SITE_NAME`、Redis 凭据等；其“全部通过可以部署”口径偏乐观。
- 子审计初步指出 4 个高置信上线阻断项，主流程已复核其中测试与 healthz：测试 global setup 的 `_test` 库名校验发生在 destructive `db push` 之后，任意非空 DATABASE_URL 都可能先改 schema；healthz DB down 仍 HTTP 200，而 Docker/Compose 以 200 判健康。生产 S3 静默降级也已由 env/storage 代码确认。Stripe env 路径缺 webhook secret 仍有分钟级对账兜底，定级为 P1 而非 P0。

### 当前代码确认的 P0/P1 业务缺陷
- **测试命令可破坏误配的非测试库（P0）**：`tests/helpers/global-setup.ts:15-19,35-38` 对任意非空 URL 执行 `prisma db push --accept-data-loss`；`_test` 库名检查到 `:61` 才发生。由于 `vitest.config.ts:11` 对 unit+integration 都启用 globalSetup，连 `npm run test:unit` 都可能触发。故本轮明确不运行 Vitest。
- **渠道化 Stripe 游客支付回跳丢 token（P0）**：`CreatePaymentInput` 无 accessToken（`src/lib/payment/provider.ts:22-34`），渠道分支 `order.service.ts:770-779` 未传；`stripeProvider.createPayment` `providers/stripe.ts:53-65` 也未传；`stripe.ts:78-80,129-130` 因此生成无 token 的 success/cancel URL。legacy 分支 `order.service.ts:815-823` 正确传 token，是明确的双实现漂移。
- **普通订单状态流转存在 TOCTOU（P0/P1）**：`updateOrderStatus` 在 `order.service.ts:1105-1111` 读取旧订单后校验，最终 `:1160-1164` 无条件 update。并发 DELIVERED/REFUNDED 等操作可互相覆盖，甚至把 REFUNDED 写回中间态；退款路径本身有锁，但普通状态路径没有。
- **渠道 Stripe 通用回调的 paymentId 语义错误（P0/P1）**：`providers/stripe.ts:73-85` 对 checkout.session.completed 返回 session.id，通用 notify `pay/notify/[channelCode]/route.ts:115-116` 存入 Order.paymentId；退款 `order.service.ts:1409-1425` 却要求 PaymentIntent id。文档明确允许通用回调，因此这是受支持配置下的真实退款阻断。
- **COD 金额与分销口径错误（P1）**：`codFee` 在 `order.service.ts:548-550` 直接存基础 USD 费率，却在确认信 `:646-658` 与已换算的 order.total 相加并标成订单币种；非 USD 订单向配送员显示/收取错误金额。COD 创建直接 PROCESSING、不写 paidAt、不触发 `onOrderPaid`；对账 `report.service.ts:759-793` 又要求 paidAt 非空，导致 COD 永远不归属、不计佣、不结算。
- **支付 URL 创建失败被吞（P1）**：`POST /api/orders` 下单事务已扣库存/核销券后，支付 URL 异常路径需继续复核；子审计指出 orders route 会返回成功空 paymentUrl，前端只提示已提交，形成无法支付的死单。
- **后台可绕过标准支付副作用直推 PAID（P1）**：admin 状态 schema 允许 PENDING_PAYMENT→PAID，最终走 `updateOrderStatus` 普通 update，只写 paidAt，不执行 markOrderPaid 的支付流水、邮件、通知、分销计佣。
- **优惠券核销展示币种错账（P1）**：`coupon.service.ts:235-257` 将 `discountUsd` 存到 `CouponRedemption.discountAmount`，但 `:368-405` 明确把该值标成 order.currency 展示；非 USD 订单的“已用优惠”金额会错。
- **库存后台绝对写覆盖并发扣减（P1）**：`api/admin/products/[id]/stock/route.ts:19-24` 与 product PUT `:45-60` 直接写 stock；下单事务的原子 decrement 可在管理员绝对写前后被覆盖，导致丢更新/超卖。
- **邮件/站内信无可靠投递（架构 P1）**：`sendMail` 在 `src/lib/mail/index.ts:292-320` 吞掉发送异常并仍记录“邮件已发送”；调用方 try/catch 实际抓不到。大量 `void sendMail/notify` 无 outbox/retry/dead-letter，进程退出会永久丢通知。后台上线自检只能证明“现在能发”，不能保证订单事件送达。
- **刷新 token 60 秒宽限削弱重放检测（P1）**：`session.ts:201,227-270` 对已使用 token 在 60 秒内直接签发新会话且无设备/客户端绑定；被盗者与正常并发客户端在窗口内不可区分，真实重放可绕过全设备吊销。需更短/单飞/客户端实例绑定方案。
- **Webhook 缺 event.id 去重、退款缺可靠 outbox（P1）**：支付状态更新有订单级幂等，但 Stripe 事件本身无 provider+eventId 唯一记录；退款先本地置 REFUNDED 再调用网关，失败仅告警，崩溃/超时可造成本地与资金状态长期不一致。

### 合规与隐私
- “账户删除”当前是 User 记录匿名化，不是个人数据删除：Order.contactEmail/addressSnapshot、NotifyMe.email、审计 meta 等仍可能保留原 PII；需明确财务/法律保留期、访问权限、清理计划，并修正文案中“历史订单不再识别用户”的绝对承诺。

# CHANGELOG

记录面向商业化交付的系统性修复与改进。每一项均经过代码层面的修改并可直接验证。

> **接手必读**：
> - 整体开发文档：[docs/PROJECT_DEVELOPMENT.md](docs/PROJECT_DEVELOPMENT.md)
> - 速查手册：[docs/QUICKSTART_2026-09.md](docs/QUICKSTART_2026-09.md)（10 分钟上手）
> - 部署上线：[docs/PRODUCTION_DEPLOY_2026.md](docs/PRODUCTION_DEPLOY_2026.md)
> - 上线清单：[docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md)
> - 历史会话/审计文档已归档清理（以当前文档为最终基准）。

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

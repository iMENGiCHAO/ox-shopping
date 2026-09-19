# 任务计划：电商整站样式与功能审查（shop + admin → 商业交付）

## Goal
对电商整站（前台 shop + 后台 admin）做全面样式与功能审查，对照参考站 shop.x.com 设计规范逐项比对，
找出并修复所有影响商业交付的问题（样式偏差、交互缺失、功能 bug、响应式问题、冗余/失效功能），
直到整站达到可商业交付完成度。

## 基线事实
- 技术栈：Next.js 16 App Router + TS 严格 + React 19 + Tailwind + shadcn/ui + Prisma/PG + Redis(可选)
- 设计规范：docs/DESIGN.md（shop.x.com 对齐：白底黑头黑脚、0 圆角、常规字重；admin 用 .admin-theme 作用域现代 SaaS 风）
- dev server 3000 端口（梦哥重启后 PID 4696 前后），PG 5432 UP，REDIS_ENABLED=false（自动降级，正常）
- 工作区为大规模未提交改动集（139 文件 +2163/-4185，Feature Trim + Cleanup），HEAD 为旧基线
- 项目在 Time Machine 网络卷：Turbopack dev 编译慢（首次路由编译曾 60s 超时），环境特性
- QA 工具：scripts/design-assertions.cjs + scripts/qa/*.mjs + tests/e2e/*.spec.ts
- 种子账号：admin@example.com / Admin@123456，user@example.com / User@123456

## Phases

### Phase 1: 环境与基线摸底 — Status: complete
- [x] 确认 dev/PG/Redis 状态
- [x] design-assertions 15/15 通过
- [x] qa-a11y / qa-mobile / qa-links / qa-lang 全过
- [x] lint 53 warnings 0 errors 基线；typecheck 0 错误

### Phase 2: 视觉走查（shop 前台）— Status: complete
- [x] 模型无图能力 → 程序化 DOM/CSS 断言替代（qa-shot 截图 + design-assertions + 自写检查脚本）
- [x] 对照 DESIGN.md 逐项检查令牌、布局、交互（首页/PLP/PDP/header/footer）
- [x] 修复：header 右侧顺序、币种触发钮双重透明度、DESIGN.md PDP 比例描述

### Phase 3: 视觉走查（admin 后台）— Status: complete
- [x] admin-theme 令牌（8px 圆角/冷调浅灰底）✓、数据表 sticky 列 ✓、侧栏 15 链接 ✓、375px 无溢出 ✓

### Phase 4: 功能审查 — Status: complete
- [x] e2e 全流程（登录→浏览→加购→结算→支付→订单）✓
- [x] admin 流程 + 通知闭环 ✓
- [x] 修复：GDPR Cookie 横幅失效功能（从未挂载→shop layout 挂载+闭环验证）
- [x] 修复：默认币种回归 EUR→USD（含单测断言同步）
- [x] 死代码：删 5 个零引用组件

### Phase 5: 修复所有问题 — Status: complete
- [x] 4 个 P1/P2 修复（见 findings.md）
- [x] lint 53→11 warnings（0 errors）
- [x] prettier 格式化本次修改的 11 个文件

### Phase 6: 回归验证与交付 — Status: complete
- [x] typecheck 0 错误；单测 84/84；视觉基线 5/5；E2E 全过
- [x] 终验：重跑全套 QA（design/a11y/mobile/links/lang/sweep）
- [x] 清理临时诊断脚本（合并为 scripts/qa/qa-layout.mjs + 新增 E2E 用例）
- [x] 更新 CHANGELOG.md
- [x] 交付报告

### Phase 7: 大爷七项收尾 + 环境抢救 — Status: complete
- [x] ① PDP 缩略图滑动过渡（transform 轨道 500ms 缓出，细粒度采样验证）
- [x] ② 灯箱拖拽成环（取模邻居，0→5/5→0 双向）+ 松手平滑归中 + 换片抖动根因修复（flyKeyRef）
- [x] ③ 通盘检查：admin/settings 删无用只读卡+冗余按钮；DESIGN.md 币种描述修正（CNY→USD）；
      9 处单键 orderBy 加 id 决胜键（重启换品根治）；视觉基线三重稳定化（连续 3 轮 5/5）
- [x] ④ 银行卡支付预留（provider+注册+种子+迁移补齐，公开 API available:false 置灰正确）
- [x] ⑤ 库存提示、⑥ 密码并入资料、⑦ 账户菜单统一（先前轮完成，本轮终验通过）
- [x] PostgreSQL 环境抢救：icu4c 78 multithreaded FATAL 二进制补丁 + 幂等脚本
      scripts/fix-postgres-multithreaded.sh；DB 快照补 2 迁移 + 重播支付渠道种子
- [x] 终验全套通过：typecheck/lint/单测 84/视觉 3×5/5/E2E shop 2/2 + auth/admin 5/5/design 15/15/QA 全家桶

## Phase 13: shop.x.com 样式与功能完整照搬（大爷 2026-09-20 提出）— Status: in_progress

背景：大爷要求「把 shop.x.com 网站样式和功能完整照搬，前后端都一样」。
workbuddy 并行重构被终止，梦哥完整接手（其未完成/有缺陷的改动一并接管修复）。

原站实测基线（Playwright 直连 shop.x.com，非猜测）：
- 店铺页脚**6 条**：FAQs · Search · Accessibility Statement · Privacy Policy(外链 x.com)
  · Terms and Conditions(/pages/terms-and-conditions) · Cookie Consent(?preview_privacy_banner=1)
  —— 没有 Your Privacy Choices，没有 Refund Policy
- checkout 页脚 3 条：Refund policy · Privacy policy · Cookies
- `/products` 与 `/collections` 都是 **All collections 索引页**（4 张正方形集合卡片：
  Mens / SpaceXAI Collection / Womens / X Collection），商品网格在 `/collections/<slug>`
- checkout 是多步流程：信息 → 运费 → 支付 → 确认，页脚三条法务链接
- **游客可直接结账下单**（Shopify guest checkout）

- [x] 13.1 页脚对齐：店铺页脚改 6 条（删 Your Privacy Choices、Privacy 改外链 x.com、
      Terms 走新路径）+ Cookie Consent 改「重新唤起同意横幅」语义（原生 a 全页导航 +
      查询参数强制展示）；checkout 页脚补 Cookies 第 3 条
- [x] 13.2 新建 `/pages/terms-and-conditions`（原站路径，内容取后台可编辑法务）
- [x] 13.3 PLP 重构：抽 `collections-index.tsx` / `collection-listing.tsx` 共享组件；
      `/products` 与 `/collections` 同渲染 All collections 索引；新建
      `/collections/[slug]` 集合页；旧链接 `/products?category=x` 在 proxy 中间件
      307 迁移（保留 /zh|/en 前缀）。验证 4 个集合页 200 + 商品数 15/17/15/10
- [x] 13.4 游客结账修复：checkout-flow 按登录态分流（游客走 localStorage 本地车 +
      `/api/cart/preview`，此前游客进结账页被判「购物车为空」+ 401）；新增
      `src/lib/guest-cart.ts` 公共模块供购物袋与结账页共用
- [x] 13.5 游客支付修复（真 bug）：下单后跳模拟支付页**没带游客查单令牌** →
      mock-pay 被 requireOrderAccess 403 → 页面静默卡在 Processing、订单永不 PAID。
      修复：跳转时把 `orderToken` 附加到 paymentUrl。全链路实测：加购 → 四步结账 →
      下单（userId=null + contactEmail + accessToken）→ 带 token 支付 → 订单 PAID →
      结果页 → 凭 token 查单 200 / 无 token API 403 → 确认邮件已发
- [x] 13.6 E2E 适配：auth/shop 选择器改 placeholder 形态（原站无框外 label）；
      shop 全链路改走集合页 + 多步结账 + 内联地址表单；admin-shipping 等对话框
      卸载后再点行内按钮；视觉基线重拍（页脚/PLP 变化）
- [x] 13.7 细节收口：PDP 图库/规格颜色、分类页横幅与卡距、商品卡间距、售罄标签、
      搜索结果页与浮层、页脚、骨架屏、登录表单 method=post 全部按原站实测对齐
- [x] 13.8 后台：用户删除、商品批量删除、上传按用途归档、分类弹窗对齐
- [ ] 13.9 待办：原站式找回密码（B-2）、死代码清理（需 knip 类工具）、文档收口

## Phase 12: 假功能通盘清查 + 账户注销闭环（大爷 2026-09-17 提出）— Status: complete

背景：大爷指出「账户删除功能跟后台管理没有衔接好」——摸底实锤：注销申请提交后只写
审计日志+发确认邮件，admin 端零衔接（无通知/无筛选/无处理入口），是全站唯一半假功能；
顺带全站复查其余均为真实业务闭环（改邮箱/改密码/数据导出/忘记密码/退款入口/价格告警/
admin 16 页数据源全部核实）。汇率管理复核：API+CurrencyManager UI+settings 渲染齐全，
前一轮摸底误判（grep 目录漏 components），已澄清。

- [x] 12.1 注销闭环（核心整改）：
      schema User.deletionRequestedAt（有值=申请处理中）+ 迁移；
      POST /api/user/deletion-request：重复提交 409 + 审计 + 双语确认邮件 + notifyAdmins
      站内通知（title「客户申请注销账户」，link /admin/users）；
      DELETE 同路由 = 用户自助撤回（无在途 409，审计 DATA_DELETION_CANCEL）；
      /api/auth/me 返回 deletionRequestedAt（前端渲染状态卡）；
      profile 页注销卡条件渲染：在途→红框状态卡（申请时间+撤回按钮），无→原提交 UI；
      admin 闭环：users 列表 deletion=1 筛选 + 行内「注销申请中」红徽标 + 详情申请日期行
      + 处理块（驳回备注 Textarea + 两按钮）；admin 不能处理自己（400）；
      新 POST /api/admin/users/[id]/deletion：approve=匿名化（先发 account-deleted
      确认邮件到原邮箱再 email=deleted-{id}@invalid.local、name=已注销用户、DISABLED、
      revokeAllUserTokens 全端会话即时吊销），reject=清字段+deletion-rejected 邮件
      （备注可选随邮件）+ 双审计；驳回不动账户任何字段
- [x] 12.2 全站假功能复查：注销申请半假为唯一实锤（已修）；汇率管理经复核功能完整
      （GET/PUT/refresh API + CurrencyManager + settings 页 261 行渲染，勿重复造轮子）
- [x] 12.3 测试：集成 tests/integration/user-deletion.test.ts 8/8（提交/重复 409/撤回/
      重复撤回 409/admin 通知落库/无申请 400/驳回恢复/匿名化+会话吊销+旧邮箱登录 401）；
      QA scripts/qa/qa-phase12.mjs 22/22 ALL PASS（注册→提交→状态卡防重复→撤回→再提交→
      admin 通知中心→筛选+徽标→详情处理块→驳回→恢复→确认注销 confirm→匿名化→旧会话
      被弹回登录→DB 匿名字段核验→375px 双页无溢出）
- [x] 12.4 E2E 基建根治（本轮新发现）：shop.spec「买 PLP 第一张卡」把 xai-multi-tumbler
      买到售罄（soldCount 100/stock 0）→ 第一张卡易主 → PDP 基线整页漂移；
      改造：shop.spec 固定买 kids-grok-to-understand-tee + 测试末尾 admin API 自动
      还原库存 50（数据零侵蚀）；visual PDP 固定拍 xai-thermal-beanie + mask 掉
      "You may also like" 推荐区（数据驱动动态排序，业务上本就不该锁基线）；
      修复 dev 库被侵蚀数据（tumbler/vessel 恢复种子 50/0）；
      toHaveScreenshot timeout 10s→30s（慢卷 fullPage 生成超时误报）
- [ ] 12.5 回归：tsc 0 错、eslint 0 errors、vitest 152/152（新增 8）、E2E 曾挂
      spec 单跑复核全过（shop.spec timeout 180s→360s）；CHANGELOG + findings 更新。
      状态（round 1-4 证据链）：workbuddy 并行重构持续进行，全站终验被阻塞——
      r1 首页 500（product/stats service 中间态）→ r2 vitest 600s 超时 →
      r3 E2E 12/14 failed（shipping/checkout 正在被改）+ qa-phase11 A-D 19 PASS →
      r4 tsc 全炸（checkout 页面文件被移动/删除 TS6053）。
      梦哥 Phase 12 自有交付已全部验证：vitest 152/152（r3 workbuddy 第一轮
      大改后复跑）、qa-phase12 22/22、集成 8/8、qa-phase11 A-D 段 19 PASS、
      注销文件全部健在且 notifyAdmins 依赖兼容。
      待办（外部条件解除后）：workbuddy 重构落定 → tsc 0 错 → E2E 全量
      14/14 → qa-phase11 全段 → 收尾交付

## Phase 8: 物流模板创建体验重做（大爷 2026-09-16 提出）— Status: complete
- [x] 8.1 Service/API：listAllShippingMethods 带 orderCount；POST 重复代号友好 409（CODE_EXISTS）
      + 代号格式校验；GET 返回 orderCount
- [x] 8.2 新建 shipping-method-dialog.tsx：创建/编辑一体对话框——快速模板（标准/特快/到付/免邮）、
      分区分组表单（标签+说明文字）、RHF+zod 行内校验、代号自动生成、顾客结账页实时预览
- [x] 8.3 重构 shipping-methods-manager.tsx：只读展示表（替代 6 输入框内联编辑）+ 启用快捷开关
      + 编辑对话框 + ConfirmDialog 删除（含订单引用提示）+ EmptyState + 新建按钮；
      修启用开关与编辑按钮重叠（操作列 min-w-7rem nowrap + 表 min-w-880px，1024px 实测 18px 间隙）
- [x] 8.4 页面换 AdminPageHeader + 描述更新；管理壳顶栏 h1→span（修每页双 h1）
- [x] 8.5 新 E2E：tests/e2e/admin-shipping.spec.ts 2/2 通过（全流程 + 校验）
- [x] 8.6 预检通过；qa-shipping 29/29 + 几何检查 6 视口全过

## Phase 10: 支付渠道预留接口整改（大爷 2026-09-16 提出）— Status: complete
- [x] 10.1 统一预留三态：未配置/已配置/可收款（PaymentProvider.isReady；前台 available=enabled+configured+ready；
      启用门控=必须先配置，服务端 badRequest 拦截）；后台状态徽标与描述语全渠道统一
- [x] 10.2 新增 stripe（渠道化真实接入：channel config 密钥 → 真 Checkout Session，含 verifyNotify 两条事件路径
      + 渠道密钥退款）+ paypal（预留级 Orders v2 参数组装，同 bankcard 模式）；
      alipay/wechat/bankcard 显式声明 isReady=false（预留语义不再依赖缺省）
- [x] 10.3 stripe.ts 密钥覆盖 clientFor/keys 参数（缺省 env 单例）；order.service 渠道化 stripe 分支
      （会话复用 + paymentSessionId 落库对账）；webhook/scheduler/退款路径渠道密钥优先、env 回落
- [x] 10.4 validateChannelConfig 补 bankcard（网关 URL）/stripe（sk_/whsec_/pk_ 前缀）/paypal 分支
- [x] 10.5 seed + migrate:payment-channels 全渠道幂等建行（mock 启用，其余 enabled=false 空配置，6 渠道排序）
      ；dev 库已执行迁移，6 行齐全
- [x] 10.6 后台支付渠道页 UI 升级（已配置/未配置 + 可收款/预留·待接入徽标、未配置禁用开关 + title 提示、
      渠道说明展示、paypal sandbox 开关控件）
- [x] 10.7 docs/payment-channels.md 对齐（6 渠道表 + 三态状态机 + stripe/paypal 字段表）；
      单测 tests/unit/payment-channels.test.ts 10/10；QA 脚本 qa-payment-channels.mjs 36/36 全绿
- [x] 10.8 回归全绿：typecheck 0 错误；eslint 0 errors；全量单测 135/135；E2E shop+shipping 4/4（mock 结账零破坏）

## Phase 11: 六项业务整改（大爷 2026-09-17 提出）— Status: complete

摸底结论（现状）：
- 法务：admin/legal→site_settings→前台 policies 已同键关联；但 ① footer 缺「退款政策」入口
  ② readPolicy 把 string 规范化为 {zh:内置默认, en:value}——admin 中文编辑保存后**中文前台不生效**（关联脱节根因）
- 注册：IP 限流 3/min + 密码强度 + 邮箱唯一 + 验证邮件 + 审计 + 管理员站内通知已有；
  缺口：sendMail await 失败会让已创建的用户收到 500；无蜜罐/全局阈值
- 币种：下单存用户币种金额+汇率快照 ✓、仪表盘 USD→CNY 折算 ✓、按币种分组统计后端已有
  （revenueByCurrency）但**前台无展示**；缺口：渠道×币种无匹配（USD 订单可选支付宝）
- 客户管理：搜索/状态筛选/订单数/详情已有；缺累计消费、最近下单、订阅视图
- 到货提醒：notifyRestock 闭环完整（admin 改库存/编辑/上下架 + 退款/取消回补全部触发、
  变体级匹配、商品卡数据、双语、管理员通知）；邮件已有基础商品卡，细节待做足

- [x] 11.1 法务关联修复：footer 补「退款政策」链接；readPolicy string 语义修正为
      {zh:value, en:value}（与 siteName readI18n 一致，消灭中文编辑不生效）；
      admin/legal 重做为每文档中文/英文双语编辑（保存 {zh,en}，单语历史兼容）；
      QA qa-legal.mjs（编辑→前台双语生效→页脚 Refund→恢复默认）
- [x] 11.2 注册防灌水：sendMail 容错（失败不 500、审计记录）；蜜罐字段（隐藏 company，
      非空=机器人静默 400）；全局注册阈值 100/h（防 IP 池刷量）；保持 IP 3/min 与
      邮箱验证流程；单测 + 注册 QA
- [x] 11.3 币种业务补齐：PaymentProvider.supportedCurrencies（国内渠道限 CNY）；
      /api/payment/channels 按 checkout 传入币种标记 currencyMismatch 置灰；
      createPaymentUrl 服务端兜底校验；仪表盘新增「各币种销售汇总」卡片；
      单测（币种矩阵）+ QA（CNY/USD 下渠道可选性）
- [x] 11.4 客户管理细化：users API 聚合累计消费（paid 折算 CNY）+ 最近下单时间；
      列表加列、详情加消费汇总与到货提醒订阅数；「邮箱未验证」筛选；
      QA（新列 + 详情 + 筛选）
- [x] 11.5 到货提醒商品卡邮件做足：预售开售文案分支（isPresale）、库存紧迫提示、
      商品卡视觉细化（420px 居中卡）、合规尾注双语；service 传 presale flag；
      单测渲染断言（图/名/规格/价/CTA/预售文案）；QA 补货触发端到端（draft→notified）
- [x] 11.6 回归：prettier/typecheck/lint/全量单测/E2E 全量（footer 变更需更新视觉基线）
      /QA 全家桶 + CHANGELOG + findings + 交付报告

## Phase 9: 整站第二轮审查（shop + admin → 商业交付复核）— Status: complete
- [x] 9.1 跑全套 QA + e2e 全量：design 15/15、links 39/39、a11y/mobile/lang/sweep 全绿
      （sweep 仅 dev 冷编译一次性 404 噪音 + 访客 /api/cart 401 预期，复测干净）；
      E2E 14/14（含视觉基线 5/5）；单测 135/135
- [x] 9.2 逐页走查复核：视觉基线锁定 shop 前台；qa-admin 全后台页面 + qa-label 面包屑
      + qa-hydration/i18n/auth/notify/loginstate/login-ui/order 全绿；新增交互由
      qa-shipping 29 + qa-payment-channels 36 + 几何 6 视口专项覆盖
- [x] 9.3 本轮新发现问题：qa-order.mjs 传参口径缺注释（误报 404）→ 已修注释；
      无产品级缺陷
- [x] 9.4 回归全绿 + CHANGELOG 更新（2026-09-17 条目）+ 交付报告
- [x] 9.2 逐页走查复核：视觉基线锁定 shop 前台；qa-admin 全后台页面 + qa-label 面包屑
      + qa-hydration/i18n/auth/notify/loginstate/login-ui/order 全绿；新增交互由
      qa-shipping 29 + qa-payment-channels 36 + 几何 6 视口专项覆盖
- [x] 9.3 本轮新发现问题：qa-order.mjs 传参口径缺注释（误报 404）→ 已修注释；
      无产品级缺陷
- [x] 9.4 回归全绿 + CHANGELOG 更新（2026-09-17 条目）+ 交付报告

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| qa-links/qa-admin 首跑超时 | 1 | dev 冷编译（网络卷），后台跑+预热后正常 |
| edit 工具对 ' 实体匹配失败 | 2 | 改用 python 精准插入 |
| /tmp 脚本解析不到 node_modules | 2 | 脚本放项目 scripts/qa 下 |
| E2E 并行 prettier --write 竞态失败 | 1 | 串行重跑通过 |
| dev server 崩溃一次（Turbopack 内部错误） | 1 | 重启 + 缓存自动清理后恢复 |
| PG postmaster "became multithreaded" 全版本必炸 | 8+ | macOS 15.7.7+icu4c78：LC_ALL 无效、
  DYLD interpose 被共享缓存拒绝、@14 也有此检查 → 二进制补丁 xor eax,eax + 幂等脚本 |
| 视觉基线每轮随机挂（首页/PLP/PDP 轮流转） | 10+ | 三重根因：orderBy 并列漂移（加 id 决胜）、
  灰占位假完成（naturalWidth≤2 强制重载）、懒加载漏触发（loading=eager 强制）+ 2% 噪声底 |
| e2e shop 全链路卡在 mock 支付跳转 | 2 | DB 快照缺 payment_channels 表 →
  prisma migrate deploy 补 2 迁移 + 重播渠道种子恢复 |
| 支付渠道页 API 500（改动后） | 1 | dev server Turbopack 旧缓存编译态损坏；vitest 对库复现函数正常 →
  scripts/restart-dev.sh 重启即恢复（该函数逻辑本身无错） |
| qa-payment-channels 首跑 11 FAIL | 2 | ① isVisible() 不自动等待：重启后客户端渠道 fetch 未返回即断言 →
  goto 后显式等列表文本；② 动作 toast 等 15s < 路由冷编译（网络卷数十秒）→ 放宽 60s + 开头幂等还原 |

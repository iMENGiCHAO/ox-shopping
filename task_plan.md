# Task Plan — shop.x.com 风格设计整改 + 工程级商用分析

## Goal
把星辰商城整改为 **shop.x.com（SpaceXAI Shop）风格**的时尚简洁网店：
白底黑字、黑色头尾导航、常规字重 Helvetica、0 圆角、极简商品陈列；
同时输出「工程级商用」差距分析与路线图。

## 设计基准（docs/DESIGN.md 已有规范，本次对齐代码）
- 页面背景 #FFFFFF；正文 #1C1C1C；商品图底 #EFEFEF；描边 #DDDDDD
- 头部/页脚黑色，文字白色（链接 65% 透明度）
- 主按钮黑底白字；描边按钮白底黑字 + hover 黑色扫入
- 圆角全部 0；字体 Helvetica/Arial（中文 PingFang/雅黑），字重 400
- 首页：左右各半 Collection 横幅（[分类名]+查看全部）→ 居中全部商品网格
- 列表页：黑色横幅 + 左筛选栏 + 三列网格
- 详情页：左图右信息 65/35，左侧竖排缩略图，主图点击放大 lightbox
- 商品卡：hover 双图切换 / 快速加购圆钮 / 色卡；标题 13px 价格 15px 字重 400

## Phases

### Phase 1 — 现状审计与分析 ✅ complete
- 通读 README / DESIGN.md / globals.css / tailwind.config.ts / 核心页面组件
- 结论：功能层完整（认证/购物车/订单/支付/管理端/i18n/多币种/测试/CI/Docker），
  但设计已漂移为 Apple 蓝大圆角风；README 与代码不一致；无版本化迁移。

### Phase 2 — 设计令牌层 — status: complete
- globals.css：换 shop.x.com 令牌（白底/黑字/#EFEFEF 图底/#DDD 描边/黑主色/0 圆角）
- tailwind.config.ts：Helvetica 字体栈、radius 0、mono 色板对齐、阴影极简化
- layout.tsx：移除 Google 字体（Sora/Inter），用系统 Helvetica 栈

### Phase 3 — 核心组件 — status: complete
- button.tsx：default 黑底白字直角；outline 白底描边+hover 扫入效果
- header.tsx：黑色顶栏 + 分类导航行（新增桌面分类导航）
- footer.tsx：黑色页脚、居中链接排布
- product-card.tsx：#EFEFEF 图底、居中信息、快速加购圆钮、色卡
- quick-add-button / quantity-input / input / badge 等基础件去圆角

### Phase 4 — 页面级 — status: complete
- 首页：shop.x.com 式 hero（双 Collection 横幅）+ 全部商品
- 列表页：黑横幅 + 极简筛选栏
- 详情页 + gallery：65/35 布局、竖排缩略图、lightbox
- cart-drawer / search-overlay：黑白极简
- 认证/账户/订单页跟随新令牌自动收敛，重点页微调

### Phase 5 — 文档与商用分析 — status: complete
- 更新 docs/DESIGN.md 使其与代码一致
- 新增 docs/COMMERCIAL_READINESS.md（工程级商用差距分析+路线图）

### Phase 6 — 验证 — status: complete
- npm run typecheck / lint / build 全绿
- 启动 dev server 截图验证首页/列表/详情视觉效果

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 页面全 500：Can't reach database server 127.0.0.1:5432 | 1 | 本机 PG 未启动 → 用项目自带 .test-pg17/bin/pg_ctl 启动 .test-pg-data 集群（trust 认证，库已种子） |
| Prisma 报 categories.nameEn 列不存在 | 1 | 旧库 schema 落后 → npx prisma db push 同步 |
| bg-ink 类不生效（头/脚透明） | 1 | tailwind.config.ts 漏配 ink 色映射 → 补 ink:{DEFAULT,foreground} |
| 断言失败：CSS 全丢、字体 Times | 1 | 生产 build 与 dev 共用 .next 冲突 → 重启 dev server |
| GLM 视觉 API 429 / 空响应 | 1 | 加指数退避重试 + reasoning_content 兜底 |
| Tailwind 警告 duration-[6000ms] ambiguous | 1 | 改 duration-[5000ms] 并去掉冗余 motion-reduce 变体 |

## Final Verification
- tsc --noEmit ✅ · next lint ✅ · npm run build ✅（75/75 pages）
- 单元测试 54/54 ✅ · DOM 设计断言 9/9 ✅ · GLM 视觉审阅 4 页风格达标 ✅

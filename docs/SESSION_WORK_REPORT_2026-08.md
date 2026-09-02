# 会话工作完整报告（2026-08-25 → 08-26）

> 目的：完整记录本窗口内全部工作，供下次版本迭代直接接手。
> 状态：代码全部在工作区（**未提交**），dev 服务运行于 http://localhost:3000。

## 一、项目概览

- **星辰商城 / Ox Shopping**：Next.js 16（App Router + Turbopack）+ TypeScript 严格模式 + React 19 + Tailwind + shadcn/ui。
- 数据层：PostgreSQL 16 + Prisma 5；Redis（ioredis，可降级内存）；Stripe + Mock 支付；Resend/SMTP/console 邮件；S3 兼容存储。
- 目标：镜像 shop.x.com 官方样式与交互的工程级购物系统，达到可交付/可商用状态。
- 官方参考站：https://shop.x.com（本机经代理 `http://127.0.0.1:10809` 可访问，无代理直连会被 SSL 拦截）。

## 二、本窗口完成的工作（按阶段）

### 阶段 1 · 商业就绪深度审计（只读）
- 产出 [COMMERCIAL_AUDIT_2026-08.md](</Volumes/Time Machine/DeepSeek/ecommerce/docs/COMMERCIAL_AUDIT_2026-08.md>) 与 [COMMERCIAL_AUDIT_DEEP_2026-08.md](</Volumes/Time Machine/DeepSeek/ecommerce/docs/COMMERCIAL_AUDIT_DEEP_2026-08.md>)。
- 审计发现：P0 五项（Webhook 400/部分退款、退款并发、券限额、XFF 限流绕过、密钥/启动流程）+ P1 十二项 + P2 多项。

### 阶段 2 · 资金安全与安全加固（S1-S2）
- **Stripe Webhook**：签名失败 400、处理失败 500（Stripe 会重试）；`charge.refunded` 仅累计全额才置整单 REFUNDED（修复部分退款误判）；处理异常上 Sentry。
- **退款审批原子化**：订单行锁 + `updateMany(REQUESTED→REFUNDED)` 认领，网关失败回滚可重试。
- **优惠券限额事务化**：下单事务内锁券行，`usedCount + 待支付占用 < usageLimit`；支付时行锁原子递增；取消订单删除兑换记录（释放券）。
- **下单价格竞态**：锁行后用最新价格重算小计/折扣/运费/税额。
- **限流**：`TRUST_PROXY`（生产默认 true，取 XFF 最后一跳）；登录账号级锁定（同邮箱 5 次/15 分钟）；忘记密码按邮箱限流；券码 validate/apply 限流。
- **CSV 公式注入**、**HSTS**、**sitemap/robots**（移除认证页、禁 /auth）。

### 阶段 3 · 部署修复（S3）
- **新增 `scripts/wait-for-db.mjs`**（原来 Dockerfile 引用的文件根本不存在，容器必崩）。
- **Dockerfile**：启动默认不执行 seed（`SEED_ON_START=false`）；生产用 `node .next/standalone/server.js`。
- **docker-compose 拆分**：`docker-compose.yml` 生产严格模式（`${VAR:?}` 缺项拒启）+ `docker-compose.local.yml` 本地演示（弱密钥/Mock/MinIO/SEED_ON_START=true）。
- **seed 非破坏化**：站点设置仅缺失时创建（不再重启重置后台配置）；生产跳过优惠券种子。
- **索引迁移**：`orders.paymentId` / `paymentSessionId` + 补录 `categories.bannerImage`，`prisma migrate diff` 零漂移。
- **依赖补丁**：nodemailer 9.0.5、sharp 0.35.3；`npm audit` 从 26 漏洞降到 0（Next 16 升级后）。

### 阶段 4 · Next.js 14 → 16 升级
- **版本**：next 16.3.3、react 19.2.8、eslint 9 平铺配置、@react-email v1（render 异步）、@sentry/node 10。
- **迁移点**：`middleware.ts` → `src/proxy.ts`（导出 `proxy`）；`cookies()/headers()/params/searchParams` 全异步（27 个路由经 apiHandler 包装统一 await）；Turbopack 默认（删除 webpack 配置，用 `serverExternalPackages`）；`next lint` → `eslint .`（eslint.config.mjs）；standalone 产物验证（含 pdfkit/@sentry）。
- 注意：Next 16 下 `next start` 不支持 standalone 输出，生产必须 `node .next/standalone/server.js`（Dockerfile 已如此）。

### 阶段 5 · 前端样式全面对齐官方（shop.x.com 实测数值）
- **顶栏**：65px 黑条、48px 边距、LOGO 左缘 48px（全视口）、工具区 12px 文字/24px 图标、桌面纯文字（无图标）、移动端仅 LOGO+搜索+购物车（购物车跳 /cart 页面）、币种下拉移动端底部弹层。
- **首页横幅**：Shop All 移到分类名正下方（24px 间距、46px 高，官方实测）。
- **PDP**：参数表 1px #DDD 网格（横线+竖线、首列无左线、16/12 内边距）；画廊缩略图 90px 对齐、参数表与缩略图左缘对齐；价格↔描述 16px 分隔线；描述在规格前；数量选择器 40×25/15px；收藏心形在大图右上角。
- **搜索**：浮层空态透明/结果实心（官方）；Pages 联想（静态页+FAQ+参数表）；搜索页 Pages 页签含参数表结果。
- **搜索工具行（最终态，2026-08-26 实测）**：`justify-between` 两侧布局 —— 左 Availability（弹层 `align="left"` 向右展开，避免露边）、右 Sort by；Price 菜单已删；移动端冗余 Filters 抽屉已删（其内容与 Availability 菜单重复）；两者均支持点空白/Esc 关闭；桌面与 390px 手机端坐标已实测（Availability 左缘 = 容器左缘，Sort by 右缘 = 容器右缘，弹层均在视口内）。
- **账户**：顶栏账号单链接（非下拉）；订单/收藏/优惠券/退出收进个人中心左侧导航；收藏功能完整落地（API+Provider+页面+商品卡/详情页心形）。
- **表单/输入框**：48px/15px/#DDD（官方）；28px 标题行高 1.4；18px 标题 1.6；购物车/404 标题行高对齐。
- **商品卡**：12px 标题/15px 价格/网格 64×12（原本已对齐，复核通过）。

### 阶段 6 · 后台管理系统体检与修复
- 报告：[ADMIN_AUDIT_2026-08.md](</Volumes/Time Machine/DeepSeek/ecommerce/docs/ADMIN_AUDIT_2026-08.md>)。
- 导航中英混杂修复（Banners/Notify Me/Payments/Legal Pages 入词典，Orders 修正）。
- **支付接口页**原是假功能（保存 API 不存在）→ 改为只读状态面板（新增 `/api/admin/payments/status`，不暴露密钥）。
- 后台左上角品牌改为用户提供的 LOGO（`public/images/brand/admin-logo.png`）。
- 评价管理模块曾新增后按用户要求**删除**（页面/API/导航均移除）。

### 阶段 7 · 数据与搜索增强
- 清洗 17+1 条商品描述中的官方抓取样板句（"See Size Chart below for best sizing..."），消除搜索误命中。
- 新增 [searchable-pages.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/lib/searchable-pages.ts>) 共享注册表；`/api/search/pages` 检索静态页+FAQ+参数表。
- 新增 [chart-search.ts](</Volumes/Time Machine/DeepSeek/ecommerce/src/server/services/chart-search.ts>)：参数表检索 = 数据库 sizeChart JSON + 代码内置注册表（`searchSizeChartSlugs`）合并。
- 收藏功能：`/api/user/favorites`（GET 列表）+ `POST /api/user/favorites/[productId]`（切换）+ FavoritesProvider + FavoriteButton（overlay/plain 两种样式）+ `/account/favorites` 页面。

## 三、当前工作区状态

- **未提交**：96 项改动（74 个跟踪文件修改 + 新文件），全部在本窗口产生，建议分批 commit（详见文末）。
- **关键新文件**：`src/proxy.ts`、`src/lib/searchable-pages.ts`、`src/server/services/chart-search.ts`、`src/components/shop/favorites-provider.tsx`、`favorite-button.tsx`、`account-logout-button.tsx`、`src/app/(shop)/account/favorites/`、`src/app/api/search/pages/`、`src/app/api/user/favorites/`、`src/app/api/admin/payments/`、`src/components/shop/` 多项改版、`eslint.config.mjs`、`docker-compose.local.yml`、`scripts/wait-for-db.mjs`、两个新迁移、`docs/*`、`public/images/brand/admin-logo.png`。
- **AGENTS.md / CLAUDE.md**：Next 16 dev 自动生成（建议随代码提交，避免反复重建）。

## 四、验证状态（本窗口末尾）

- `npm run typecheck` ✅（0 错误）
- `npm run lint` ✅（0 错误，约 50 条既有警告，均为未使用变量类）
- 单元测试 72/72 ✅；集成测试 34/34 ✅（含 proxy/CSRF/资金完整性）
- Next 16 Turbopack 生产构建 ✅；standalone 冒烟（首页/商品/后台/登录 API 全 200）✅
- `prisma migrate diff` 迁移零漂移 ✅；`npm audit` 0 漏洞 ✅
- 前端逐项实测（无头浏览器对照官方数值）✅

## 五、环境注意事项（下次迭代必读）

1. **慢速外置卷**：项目位于 `/Volumes/Time Machine/DeepSeek/ecommerce`（Time Machine 卷，IO 慢）。
   - `next build` 偶发 "Cannot find module for page" 竞态 → 重试（已多次验证）。
   - **Turbopack dev 偶发内部 panic 崩溃**（"Restore of All for task ... failed ... Aborting"）→ 直接重启 `npm run dev` 即可，正常现象。
   - **HMR 文件监听不可靠**：改完文件后若页面未生效，重启 dev（本窗口多次踩坑）。
   - 新增 Tailwind 任意类（如 `pr-3`、`first:border-l-0`）可能不被扫描生成 → 优先用已有类或 globals.css 纯 CSS。
2. **npm 11 allow-scripts**：本机 npm 配置了脚本白名单，`postinstall`（prisma generate）默认不执行；装依赖后需手动 `npx prisma generate`。
3. **.env 仍是演示弱密钥**：生产启动守卫会正确拒启（预期行为）。上线前 `openssl rand -base64 48` 生成 JWT 双密钥。
4. **官方站访问**：本机无代理直连 shop.x.com 会 SSL 失败；抓官方页面用 `curl -x http://127.0.0.1:10809 ...` 或 Playwright 带 proxy。
5. **dev 常驻**：当前 dev 服务由会话托管在 3000 端口；不要在它运行时再起一个（端口冲突 + .next 混用）。
6. 生产运行：Docker（内部 `node server.js`）或 `node .next/standalone/server.js`（需先复制 static/public + 显式环境变量），**不要用 `next start`**。

## 六、下一迭代待办（按优先级）

### A. 上线前必须（工程）
1. Docker 主机冒烟：`docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`（本机无 Docker 未验证）。
2. 生产 `.env`：强 JWT 密钥、S3/Stripe/邮件真实凭据；`npm run db:deploy` + `admin:create` 建首个管理员。
3. Stripe Webhook 配置（checkout.session.completed / payment_intent.payment_failed / charge.refunded）+ 发信域名 SPF/DKIM。
4. 备份异地 + 恢复演练（`scripts/backup-db.sh` 目前仅本地目录）。
5. 提交本窗口全部改动（建议按：依赖升级 / 后端安全 / 前端样式 / 后台 / 部署 分 5 个 commit）。

### B. 工程收尾（S4/S5 遗留）
6. Prisma 5 → 6（可选）。
7. Sentry 全覆盖：`@sentry/nextjs` + instrumentation（当前仅 apiHandler 手动捕获）。
8. 邮件失败重试/队列；关键邮件（验证/重置）失败需可见。
9. healthz 增加 DB/Redis 就绪探测；Nginx 静态 location 补安全头。
10. 静态页（政策/FAQ/无障碍）ISR 化，减少全站 force-dynamic。

### C. 后台运营增强（详见 ADMIN_AUDIT）
11. 后台全量 i18n（product-form 等 11 个文件约 200 处硬编码中文）。
12. GDPR 数据删除执行队列（当前仅前台登记）。
13. 邮件模板"测试发送"、库存预警页、订单批量状态操作。

### D. 前端继续对齐/优化
14. 未逐项对照官方的页面：checkout、orders、account 各子页、auth、政策页（这些是功能性页面，官方无直接镜像，按设计语言对齐即可）。
15. 多币种只展示不结算（Stripe 不支持 CNY）；图片素材替换占位图。
16. 搜索性能：LIKE 三字段扫描，>5k SKU 上全文检索。

## 七、常用命令

```bash
npm run dev              # 开发（Turbopack，3000）
npm run build            # 生产构建（慢盘偶发失败，重试）
npm run typecheck / lint / test:unit / test:integration / test:e2e
npm run db:migrate       # 开发迁移（prisma migrate dev）
npm run db:deploy        # 生产迁移
npm run db:seed          # 种子（生产跳过演示账号）
npm run admin:create -- <email> '<password>'
```

## 八、对接人备忘

- 用户偏好称呼：大爷；助手自称：梦哥（见 AGENTS.md 原约定）。
- 用户风格：要求"跟官方保持一致"，倾向一次做全、不要挤牙膏；视觉验收用 shop.x.com 实测数值对照。

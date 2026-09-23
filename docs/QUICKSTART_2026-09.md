# 接手必读：项目全貌 + 关键约束（2026-09-20 更新）

> **这 1 个文件让你 10 分钟上手本项目。**
> 它是关键约束速查：技术栈版本、启动步骤、环境坑、前后台规范、上线清单。
> 接手的工程师 / 下一个会话的梦哥，开工前务必读完本文。
>
> **本文档已同步至 2026-09-20（含 Phase 12 注销闭环、Phase 13 shop.x.com 照搬、B-2 原站式找回密码）。**

---

## 0. 项目身份

- **名称**：Ox Shopping（前后台统一品牌）
- **目标**：商业可交付电商系统（参考 shop.x.com 风格 + 中国运营后台）
- **用户画像**：中国运营（大爷）面向海外消费者
- **核心定位**：前台英文为主（选 CNY 才切中文）+ 后台统一中文

## 1. 技术栈

| 层        | 选型                                                                            | 版本                                                                                                                |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Framework | Next.js                                                                         | 16.3.3 (App Router + Turbopack + proxy.ts)                                                                          |
| UI        | React                                                                           | 19                                                                                                                  |
| Type      | TypeScript                                                                      | 5.6                                                                                                                 |
| DB        | PostgreSQL                                                                      | Homebrew @17（`scripts/start-db.sh`）；macOS 15.7+ 必须先 `scripts/fix-postgres-multithreaded.sh` 打补丁（见 §5.1） |
| ORM       | Prisma                                                                          | 5.22                                                                                                                |
| 样式      | Tailwind                                                                        | 3.x（radius 全部 0 / 12-13px 字号）                                                                                 |
| 测试      | Vitest                                                                          | tests/unit 20 文件 + tests/integration 14 文件 = 34 文件 / 317 用例全绿（2026-09-20 实测）；E2E 见 tests/e2e        |
| Auth      | 自研 JWT 双令牌 cookie                                                          | access 15min / refresh 7d（jose，非 iron-session）                                                                  |
| 支付      | 六渠道三态                                                                      | mock / stripe（渠道化真实接入）/ paypal / alipay / wechat / bankcard（预留级）                                      |
| Currency  | 内置汇率（USD/CNY/EUR/GBP/JPY/HKD/SGD/AUD/CAD 9 币种）+ 每日刷新 + 后台手动覆写 |

## 2. 项目结构

```
ecommerce/
├── docs/                          # 文档（6 份，历史会话/审计文档已归档清理）
│   ├── PROJECT_DEVELOPMENT.md     # 整体开发文档
│   ├── QUICKSTART_2026-09.md      # ← 你正在读的
│   ├── PRODUCTION_CHECKLIST.md    # 上线清单
│   ├── PRODUCTION_DEPLOY_2026.md  # 生产部署操作手册
│   ├── DESIGN.md                  # 设计规范（shop.x.com 对齐）
│   └── payment-channels.md        # 支付渠道技术说明
├── prisma/
│   ├── schema.prisma              # DB schema
│   ├── migrations/                # 迁移目录（生产用 migrate deploy）
│   └── seed.ts                    # seed 脚本
├── src/
│   ├── app/
│   │   ├── (shop)/                # 前台 route group
│   │   │   ├── page.tsx           # 首页
│   │   │   ├── products/          # All collections 索引 + 商品详情
│   │   │   ├── collections/       # 集合索引 + [slug] 集合页
│   │   │   ├── orders/ account/   # 订单 / 账户中心
│   │   │   ├── cart/ coupons/     # 购物车 / 领券中心
│   │   │   └── auth/              # 登录/注册/找回密码
│   │   ├── (checkout)/            # 结账 + 强制改密独立外壳（无店铺页头页脚）
│   │   │   ├── checkout/          # 多步结账 / mock 支付 / result
│   │   │   └── auth/change-password/  # B-2 首登强制改密
│   │   ├── admin/                 # 后台（password-resets / payment-channels / coupons …）
│   │   ├── api/                   # API routes
│   │   ├── layout.tsx             # Root layout（async，<html lang={getLang()}>）
│   │   └── globals.css            # 全局样式 + CSS variables（暗色模式预留）
│   ├── components/
│   │   ├── shop/                  # 前台组件（含 collections-index / collection-listing）
│   │   ├── admin/                 # 后台组件（admin-shell / 各种 manager）
│   │   └── ui/                    # 通用 UI（button / card / dialog / pagination）
│   ├── lib/                       # 业务逻辑
│   │   ├── shop-i18n.ts / shop-i18n-server.ts  # 前台 i18n
│   │   ├── guest-cart.ts          # 游客本地车公共模块
│   │   ├── auth/                  # 认证（session / password / temp-password）
│   │   ├── payment/               # 渠道注册表与 provider
│   │   ├── storage/index.ts       # 上传（本地 / S3，按用途归档）
│   │   ├── prisma.ts              # prisma 单例
│   │   └── ...                    # 其它工具
│   ├── server/services/           # 业务 service 层（product/order/password-reset/…）
│   ├── proxy.ts                   # Next 16 中间件（CSRF / 会话 / locale / 强制改密）
│   └── types/                     # 类型定义
├── scripts/                       # start-dev-db / fix-postgres-multithreaded / restart-dev / qa/*
├── tests/                         # unit（20 文件）+ integration（14 文件）+ e2e（5 spec）
├── playwright.config.ts / vitest.config.ts
├── Dockerfile / docker-compose*.yml / deploy/nginx.conf  # 部署
├── .env.example                   # 环境变量模板
├── CHANGELOG.md                   # 变更日志（按日期分段）
├── task_plan.md / findings.md     # 任务台账 / 审查发现（梦哥工作记录）
└── README.md
```

## 3. 启动 3 步

```bash
# 1. 启动本地 PG（macOS 15.7+ 必须先打补丁，见 §5.1）
bash scripts/fix-postgres-multithreaded.sh   # 幂等；brew 升级/重装 PG 后重跑
bash scripts/start-db.sh                     # Homebrew @17 + GCD 豁免 dylib

# 2. 启动 Next dev（用 nohup + 重定向，不用 tee — 见 §5.7）
PORT=3000 nohup npm run dev > /tmp/next-dev.log 2>&1 &
disown
# 第一次编译每个页面 5-30s（Time Machine 网络卷上可达数十秒），第二次 < 200ms

# 3. 验证
sleep 10
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/  # 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin  # 200/307

# 杀 dev 用：
bash scripts/stop-dev.sh

# 改 schema / 跑迁移后（Prisma stale client）用：
bash scripts/restart-dev.sh
```

## 4. 关键数据模型

| 模型                          | 用途                         | 重要字段                                                                                                                                    |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**                      | 用户                         | role: ADMIN/CUSTOMER/SUPPORT, status: ACTIVE/DISABLED；**deletionRequestedAt**（注销申请中）、**mustChangePassword**、**passwordChangedAt** |
| **PasswordResetRequest**      | 找回密码申请（B-2 人工审批） | status: PENDING/APPROVED/REJECTED, email 快照, note, handledById/handledAt, rejectReason, ip                                                |
| **Product**                   | 商品                         | slug, sku, isPresale, presaleNoteZh/En, **images/attributes/specStock (JsonValue)**                                                         |
| **Category**                  | 分类                         | slug, name/nameEn, image/cardImage/bannerImage, **homeSortOrder**（首页横幅次序 1=左 2=右）, sortOrder, isActive                            |
| **ProductCollection**         | 商品↔集合多对多              | (productId, categoryId) 复合主键 + sortOrder（集合内陈列顺序）                                                                              |
| **Order**                     | 订单                         | orderNumber, status, addressSnapshot (JsonValue), currency, accessToken（游客查单令牌）                                                     |
| **Refund**                    | 退款                         | orderId, reason, status, amount                                                                                                             |
| **Coupon / CouponRedemption** | 折扣码                       | usageLimit/usedCount/perUserLimit，核销记录即订单优惠凭证                                                                                   |
| **PaymentChannel**            | 支付渠道                     | code, enabled, config（密钥脱敏返回，三态语义）                                                                                             |
| **ShippingMethod**            | 物流方式                     | code（唯一）, 分区费用, orderCount                                                                                                          |
| **NotifyMe**                  | 到货提醒                     | email + productId + 规格，回货触发                                                                                                          |
| **ContactMessage**            | 联系表单留言                 | name/email/message/lang/status/notified                                                                                                     |
| **SiteSetting**               | 站点设置                     | key/value JsonValue（presaleNote / siteName / policyXxx / contact_content……**法务页也存这里，没有独立 LegalPage 模型**）                    |
| **AuditLog**                  | 审计                         | userId, action, entity, meta JsonValue                                                                                                      |
| **PaymentLog**                | 支付流水                     | orderId, provider, event, amount, gatewayId                                                                                                 |
| **Faq / Notification**        | 内容与站内信                 | Faq 有 questionEn/answerEn；Notification 有 titleEn/bodyEn/isUnread                                                                         |
| **DistributionRelation**      | 分销树闭包表（无限级）       | `(ancestorId,descendantId)` 主键，`depth=0` 是自己                                                                                          |
| **DistributorCustomerBind**   | 客户归属绑定                 | **`customerId` 唯一** = 数据库级「不可抢绑」                                                                                                |
| **CommissionRule**            | 佣金规则                     | `(scopeType,scopeId,level)` 唯一；GLOBAL 的 scopeId 用空串（PG 的 NULL 不进唯一约束）                                                       |
| **CommissionLog**             | 佣金流水（只追加）           | 幂等键 `(orderId,toUserId,level)`；PENDING/SETTLED/REVERSED                                                                                 |
| **DistributorAccount**        | 分销账户（CNY）              | 余额/冻结/累计，由流水汇总                                                                                                                  |
| **WithdrawRecord**            | 提现单                       | PENDING/APPROVED/PAID/REJECTED（一期线下打款）                                                                                              |
| **OrderAttribution**          | 下单归属快照                 | 不可变；自然单 `natural=true`                                                                                                               |

> **没有 `ProductVariant` 模型**：多规格（Color/Size）以 JSON 存在 `Product.attributes`（可选值）
> 与 `Product.specStock`（各规格库存）里，售罄值另有 `attributes` 内的 `soldOutValues` 语义
> —— 见 `src/server/services/spec-stock.ts` 的 `aggregateTrackedStock`。

**所有 JsonValue 字段访问时必须先 narrow**（`product.images.filter((src: unknown): src is string => ...)`）。

## 5. 环境约束与坑位（必读！）

### 5.1 macOS 15.7+ PostgreSQL「became multithreaded」启动必炸

- **问题**：postmaster 启动即 FATAL `postmaster became multithreaded during startup`（`pthread_is_threaded_np() != 0` 自检）
- **根因**：Homebrew icu4c 78 的 `libicuuc` 在 dylib 加载时（比 `main()` 还早）就启动后台线程。**所有 Homebrew PG 14/16/17 都中招**；`LC_ALL`、`DYLD_INSERT_LIBRARIES` 覆盖、降版本全部无效（libSystem 共享缓存符号不可覆盖）。
- **正解（幂等脚本）**：`bash scripts/fix-postgres-multithreaded.sh` —— 把 `postgres` 二进制里对 `_pthread_is_threaded_np` 的 5 字节 `call`（`E8 rel32`）替换为 `xor eax,eax; nop×3`（`31 C0 90 90 90`），使检查恒为「单线程」。脚本自动备份原二进制到 /tmp 并 ad-hoc 重签（macOS 要求改后重签）；已打补丁则跳过。
  - **触发场景**：`brew upgrade` / 重装 postgresql@17 之后必须重跑。
- **另一条（遗留）路径**：`node scripts/start-dev-db.mjs` 使用 `embedded-postgres` 自带 binary，同样需要 patch，且 `embedded-postgres` **当前不在 package.json 依赖里**（要用得先 `npm install`）——日常以 Homebrew @17 + 补丁脚本为准。
- **SIP 遗留**：本机 SIP 为 Custom Configuration，`scripts/start-db.sh` 仍以 `/tmp/libnoforkcheck.dylib`（GCD workq 豁免）作为旧方案兜底。

### 5.2 Next 16 与训练数据不一致

- `proxy.ts` 替代 `middleware.ts`
- `cookies()` / `headers()` 是 **async**
- `params` 是 **Promise**（必须 `await props.params`）
- `notFound()` return type 在缺失 .d.ts 时**不是 never**，需要显式 `if (!x) throw`
- `next/image` 仍是 `Image`，但 `next/headers` 的 NextRequest 类型需要解构

### 5.3 沙箱 pnpm install 超时

- pnpm 经常 5min 超时（沙箱网络限制）
- 解决：沿用 `npm install --no-save` 或仅补缺包

### 5.4 Turbopack cache panic

- 现象：`Restore of All for task TaskId XXX failed in another thread`
- 解决：删 `.next/dev` + 重启 dev

### 5.5 next/* .d.ts 缺失

- 沙箱内 `node_modules/next/index.d.ts` 没下载
- TS 报 9+ `TS7016`（next/image / next/headers / next/navigation / next/link / next/server / next/server.js / next/types.js / next/og / next/metadata）
- **不影响 next dev / production build / runtime**（Turbopack 不依赖 tsc .d.ts）
- 等真实 CI 环境 `pnpm install` 一次自动下载

### 5.6 Prisma client 缓存（schema 改动后必须重新 generate + 重启 dev）

- 现象：API 报 `Unknown argument \`lang\`. Available options are marked with ?.` 但 schema 明明有这字段
- 根因：dev server 加载了旧的 Prisma client（stale），schema 有 `lang` 但 client 没生成
- 解决：
  ```bash
  # 一条命令搞定（杀 dev → prisma generate → 重启 dev）：
  bash scripts/restart-dev.sh

  # 或手动三步：
  # 1. 重新 generate（用 npx，别写死 .pnpm 里的长路径）
  npx prisma generate
  # 2. 强杀 dev（子进程 next-server 也得杀，否则 EADDRINUSE）—— 或直接 bash scripts/stop-dev.sh
  ps -ef | grep -E "next dev|next-server" | grep -v grep | awk '{print $2}' | xargs kill -9
  # 3. 重启
  npm run dev
  ```
- **触发场景**：每次 `prisma db push` / `prisma migrate` / 改 `prisma/schema.prisma` 后

### 5.7 dev 进程清理脚本（沙箱内 lsof 不可用）

- 现象：重启 dev 报 `EADDRINUSE :3000`
- 根因：上次的 `next-server` 子进程没被 `npm run dev` 的 `kill -9` 父进程清理掉（孤儿进程）
- 解决：
  ```bash
  # 不用 lsof（沙箱无），用 ps + nc
  ps -ef | grep -E "next dev|next-server" | grep -v grep | awk '{print $2}' | xargs kill -9
  sleep 3
  nc -z localhost 3000 && echo "still up" || echo "free"
  ```

## 6. i18n 策略（双层并存）

### 6.1 前台 i18n（路由级 locale + lang-provider + shop-i18n）

- 默认 `en`（URL 无前缀），选 CNY → `zh`
- **路由级 locale（P1-1）**：`src/proxy.ts: parseLocalePrefix()` 识别 `/zh` `/en` 前缀 → 注入 `x-lang` 请求头 → rewrite 到去前缀路由；URL 保留前缀，供 SSR 语言感知与 hreflang 交替链接（sitemap 同步）
- `getLang()` 决策（**顺序即优先级**）：currency cookie（CNY→zh，其余→en）> `x-lang` 路由头 > lang cookie > 默认 en
  - 币种必须排最前：用户选过 CNY 后落在 `/zh` 页面，若被 `x-lang` 压住，切回 USD 时语言会粘在中文
- 解决路径：`src/lib/shop-i18n-server.ts: getLang()` + `src/proxy.ts: parseLocalePrefix()` + `src/components/shop/currency-provider.tsx: syncLangCookie()` + `src/components/shop/lang-provider.tsx: useEffect([initialLang])`
- **根因修复**：`lang-provider` mount useEffect 删除 localStorage 读取路径（之前导致切回 USD 仍中文）

### 6.2 后台 i18n（统一中文）

- `admin-labels.ts` 集中维护状态/枚举 label
- 所有 label **硬编码中文**（不走 i18n 表）
- i18n 表保留（admin-lang-provider 仍可切语言，但默认不用）

### 6.3 `<html lang>` 跟随

- root layout 是 async RSC
- `<html lang={await getLang()}>` 动态跟随
- 浏览器 TTS / 翻译扩展 / 屏幕阅读器拿正确语种

## 7. Pre-order 预售提示：三级解耦

```
优先级（高 → 低）:
1. Product.presaleNoteZh / presaleNoteEn    (商品级)
2. SiteSetting.presaleNote.{zh, en}         (站级默认)
3. DEFAULT_PRESALE_NOTE_ZH/EN               (代码内置)
4. buy-panel 的 t("Pre-order item — ...")   (最后兜底)
```

- 缺该语种 → 自动 fallback 另一语种
- 后台 `product-form.tsx` 加中英双输入框
- `pickLang(value, lang)` 工具自动按当前语言选 zh/en

## 8. 后台 AdminShell 设计规范（2026-09-20 版）

- **设计令牌**：`.admin-theme` 作用域（仅 `/admin` 路由挂 `<html>`）——
  8px 圆角（`--radius: 0.5rem`）、柔和多层阴影（`--shadow-card` 等变量）、
  冷调浅灰底（`216 20% 96.5%`）+ 纯白卡片、近黑主色。**前台零影响**（`:root` 保持 0 圆角/纯黑白）。
- **侧边栏**：264px（展开）/ 72px（折叠）+ localStorage 持久化；折叠时文字隐藏、图标居中
- **折叠按钮**：顶栏左侧（最直观）+ 侧栏底部，双入口
- **链接行高**：36px (h-9) + 8px 圆角 + 13px 字号
- **激活态**：pill 风格 `bg-secondary` 浅灰底 + 主色文字 + 主色图标
- **顶栏**：64px (h-16) + 毛玻璃 `bg-card/80 backdrop-blur-md` + 1px 底分割 + 面包屑
- **导航分组**（`src/components/admin/admin-shell-server.tsx`）：
  - 主导航：仪表盘 / 商品 / 分类 / 订单 / 到货提醒
  - ADMIN 专属：消息中心 / **分销**（Phase 14，含二级 Tab）/ **找回密码**（B-2）/ 退款 / 折扣码 / 支付渠道 / 物流方式 / 法务页面 / 设置
  - ADMIN 二级（侧栏底部）：用户 / 审计日志 / FAQ 管理
- **消息中心**：Bell 角标 = 站内通知未读数 + 未读订单 + 待退款（30s 轮询），点击进 `/admin/notifications`
- **数据表规范**：一套宽度体系（复选 w-12 / 缩略图 w-14 / 短值 w-20 / 状态 w-24 / 金额 w-24 右对齐 /
  编号 w-[140px] / 用户 w-[160px] / 时间 w-[120px] / 长文本 min-w-0 / 操作列 sticky-col-right）；
  `sticky-col-left/right` 工具类实心底 + 1px 分隔线 + 表头 z-20 / 表体 z-10
- **品牌**：固定 "Ox Shopping"（前后台一致，无中英双值）；LOGO h-9 (36px)
- **横幅**：无独立入口——首页横幅由前两个分类的 `bannerImage`（回落 `image`）驱动，
  分类落地页 hero 同源；分类编辑内上传大横幅
- **参考**：Vercel Dashboard + Linear + Notion（2024-2026 一线范式）

## 9. 前台顶栏规范

- **高度**：65px
- **LOGO**：w-[78px]（height 78:18 ratio → h ≈ 52px）+ `.header-logo { padding: 6px 0 }` → 上下各 6px 留白
- **横栏对齐**：header 桌面 padding `0 48px` → 首页 banner Shop All 按钮 `sm:left-12`
- **参考**：shop.x.com 实测 48px 留白

## 10. 已知技术债

| 项                       | 风险                                          | 建议                                                       |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------------- |
| PG binary patch          | brew 升级/重装 PG 会重置补丁                  | 升级后重跑 `scripts/fix-postgres-multithreaded.sh`（幂等） |
| next/* .d.ts 缺失        | typecheck 9+ 噪音（`next/index.d.ts` 未下载） | 等真实 CI `npm ci` 一次自动下载；不影响 dev/build/runtime  |
| 前台 `/zh` 文案走查      | 词典已覆盖，长尾文案可能仍英文                | 逐页走查 `/zh`                                             |
| 联系表单留言无后台收件箱 | 留言仅入库 + 邮件通知，无列表页               | 视量补 `/admin/contact-messages`                           |
| mobile < 375px 未覆盖    | 极小屏可能溢出                                | 视觉基线目前覆盖桌面；补小屏视口                           |
| 视觉基线偶发 flaky       | 慢卷 fullPage 生成慢/数据驱动区漂移           | 已 mask 动态区 + 固定测试商品；单跑复核                    |
| **Prisma client 缓存**   | schema 改后 dev 仍用旧 client → API 500       | 已提供 `scripts/restart-dev.sh`；改 schema 后必须跑        |
| **dev 进程孤儿**         | kill -9 父进程后 next-server 成孤儿占端口     | 已提供 `scripts/stop-dev.sh` 强杀父子进程                  |

## 11. 上线清单（PRODUCTION_CHECKLIST.md 摘要）

- [ ] `npm run build` 通过
- [ ] `npx tsc --noEmit` 0 错（除 next/* 噪音）
- [ ] `npm run test:unit` + `npm run test:integration` 全绿
- [ ] `npm run test:e2e`（Playwright，含视觉基线）
- [ ] 生产容器入口只执行 `prisma migrate deploy`；缺迁移目录会拒启，禁止用 `db push` 兜底
- [ ] 存活 `/api/healthz` 不查 DB；就绪 `/healthz` 查 DB，DB 故障必须返回 503
- [ ] `npm run preflight` 复用真实 `env.ts` 守卫、真实 DB 查询和 `prisma migrate status`
- [ ] 每日备份生成 SHA-256；每季度在空临时库用 `scripts/restore-db.sh` 演练恢复
- [ ] `.env` 用生产值；`DATABASE_URL`/`REDIS_URL` 凭据已 URL 编码，`REQUIRE_STRONG_SECRETS` 未关闭
- [ ] S3 六项真实配置齐全（缺项会拒启，不会降级 local）；邮件非 console、支付非 mock
- [ ] Sentry DSN/environment/release 与 `TZ`/`APP_TIMEZONE` 已配置并完成受控告警验收
- [ ] **`MAIL_PROVIDER` 不能是 `console`**（否则找回密码临时密码邮件发不出去）
- [ ] reverse proxy（nginx.conf）配置 CSP nonce
- [ ] Cron 任务（汇率刷新 / 库存清理 / 订单超时）注册到系统 cron
- [ ] 备份策略（PG dump 每日 + S3 上传）
- [ ] 监控（error tracking / uptime / perf）
- [ ] 灰度发布（先 10% → 50% → 100%）

## 12. 近期迭代速览（Phase 8–13 + B-2）

按时间倒序，只列**接手必须知道**的结构性变更；细节见 `CHANGELOG.md` 与 `PROJECT_DEVELOPMENT.md`。

- **B-2 原站式找回密码（未提交工作区）**：用户 `POST /api/auth/forgot-password` 提交申请（防枚举 + 单 IP 3/min + 单邮箱 3/h）→ 落库 `PasswordResetRequest` + 通知管理员 → 后台 `/admin/password-resets` 批准/驳回 → 批准生成 14 位强随机临时密码（`src/lib/auth/temp-password.ts`）、邮件下发、账号置 `mustChangePassword`、吊销全部旧会话 → **首登被强制钉在 `/auth/change-password`**（`proxy.ts` cookie `pwd_change_required` + `requireUser()` DB 兜底）→ 改密走 `PUT /api/user/password`。**`MAIL_PROVIDER=console` 时邮件不投递，只能管理员在弹窗里转达；生产必须配 resend/smtp。**
- **Phase 13 shop.x.com 照搬（2026-09-20）**：页脚 6 条/checkout 3 条；`/pages/terms-and-conditions`；`/products` 与 `/collections` 同为 All collections 索引 + 新增 `/collections/[slug]` + 旧 `/products?category=x` 由 proxy 307 迁移；游客结账（`src/lib/guest-cart.ts` + `GET /api/cart/preview`）与 `orderToken` 随 paymentUrl 传递；商品批量删除、上传按用途归档 `uploads/{purpose}/年/月/`、视觉基线重拍。
- **Phase 14 分销 / 多级佣金（2026-09-20，隔离模块）**：闭包表无限级关系 + 客户归属绑定（首次绑定定终身、复购自动归属、**不可抢绑**、自然流量不分佣）+ 推广成功自动成为分销商 + 按真实订单逐级分佣（默认三级 10/5/2、总比例封顶、退款冲正、确认收货结算）+ 提现申请/审核/线下打款 + 分销商后台与平台后台 + 行级权限与脱敏。**与商城只通过 `src/server/services/distribution/bridge.ts` 一个接口面交互**（动态 import + try/catch），总开关 `DISTRIBUTION_ENABLED=false` 可整体下线且商城行为不变；佣金正确性由调度器分钟级 `reconcileDistribution()` 兜底（漏记/漏冲正会被扫平）。入口：**账户个人资料页的一张分享小卡片**（主打不占主站导航）→ 成功推广后从卡片进入**独立页面** `/distribution`；后台「分销」。
- **Phase 12 注销闭环（2026-09-18）**：`User.deletionRequestedAt` + `POST/DELETE /api/user/deletion-request` + `POST /api/admin/users/[id]/deletion`（approve=匿名化删除 `deleted-{id}@invalid.local` + 停用 + 吊销全部会话；reject=清空 + 邮件告知）；后台 `/admin/users` 筛选/徽标/处理块；B-1 另有 `DELETE /api/admin/users/[id]` 直接删除。
- **Phase 11 六项整改（2026-09-17）**：法务双语关联、注册防灌水（蜜罐 + 全局 100/h）、币种结算（渠道×币种 + 仪表盘各币种汇总）、客户管理细化（累计消费/最近下单/未验证筛选）、到货提醒商品卡。
- **Phase 10 支付渠道（2026-09-17）**：六渠道三态（未配置/已配置/可收款），Stripe 渠道化真实接入，其余预留级。
- **Phase 8 物流模板（2026-09-16）**：只读表 + 创建/编辑对话框 + 结账页实时预览。
- **测试与 QA 现状**：`npm run test:unit` / `test:integration` / `test:e2e`；`scripts/qa/*.mjs` 一套验收脚本（含 `qa-password-reset.mjs`），设计令牌断言 `scripts/design-assertions.cjs`。E2E 配置见 `playwright.config.ts`。

## 13. 与大爷的协作偏好（梦哥笔记）

### 大爷喜欢

- 直接的工程化建议（不空泛）
- 详实的代码 + 注释
- 中文交流
- 快速看到效果（不喜欢长时间编译等待）
- 商业可交付的最终质量

### 大爷不喜欢

- 过多技术理论解释
- 模糊的"我再想想"
- 中英混用的 UI（后台）
- 一直"待完成"的事项

### 沟通节奏

- 大爷 = 老板（"我去睡觉了你接着干"）
- 梦哥 = 全栈架构师（主动推进 + 主动决策）
- 沙箱审批禁用 → 必要时直接 `sandbox_permissions: danger-full-access`（但本会话不用）
- `~/.dsh/AGENTS.md` 持久记忆：称呼不可变

---

**下一位接手者**：本文读完即掌握关键约束；决策细节看 `docs/PROJECT_DEVELOPMENT.md`（§2 迭代清单 + §3 ADR），任务台账与踩坑记录看仓库根的 `task_plan.md` / `findings.md`。然后开干。

### ⚠️ 改 Prisma schema 后必须重启 dev server

`prisma migrate dev / db push / generate` 之后，**正在运行的 `next dev` 仍持有旧的 Prisma client 模块**
（Turbopack 缓存），表现是接口 500 并报 `Unknown field xxx for select statement on model ...`，
而 `tsc` 与 `vitest` 都是绿的（它们每次重新加载 client）—— 2026-09-21 因此排查了两轮。

正确顺序：`npx prisma migrate deploy && npx prisma generate` → **重启 dev**（`scripts/stop-dev.sh` 后重开）
→ 再跑 QA。生产部署同理（pm2/systemd 需要 reload，否则新字段在运行进程里不可见）。

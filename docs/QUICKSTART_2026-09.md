# 接手必读：项目全貌 + 关键约束（2026-09 更新）

> **这 1 个文件让你 10 分钟上手本项目。**
> 它是 `SESSION_2026-09_LOGO_AND_HARDENING.md` 的精简版 + 关键约束速查。
> 接手的工程师 / 下一个会话的梦哥，开工前务必读完本文。

---

## 0. 项目身份

- **名称**：Ox Shopping（前后台统一品牌）
- **目标**：商业可交付电商系统（参考 shop.x.com 风格 + 中国运营后台）
- **用户画像**：中国运营（大爷）面向海外消费者
- **核心定位**：前台英文为主（选 CNY 才切中文）+ 后台统一中文

## 1. 技术栈

| 层 | 选型 | 版本 |
|----|------|------|
| Framework | Next.js | 16.3.3 (App Router + Turbopack + proxy.ts) |
| UI | React | 19 |
| Type | TypeScript | 5.6 |
| DB | PostgreSQL | 18.4（embedded-postgres + **binary patch**，见 §5） |
| ORM | Prisma | 5.22 |
| 样式 | Tailwind | 3.x（radius 全部 0 / 12-13px 字号） |
| 测试 | Vitest | 9（80 tests / 9 files） |
| Auth | iron-session（无密码 JWT cookie） |
| 支付 | Stripe（mock 模式可演示） |
| Currency | 内置汇率（USD/CNY/EUR/GBP/JPY/HKD）+ 每日定时刷新 |

## 2. 项目结构

```
ecommerce/
├── docs/                          # 文档（11 份）
│   ├── SESSION_2026-09_LOGO_AND_HARDENING.md  # ← 本轮详细日记
│   ├── SESSION_SUMMARY.md         # 早期会话总结
│   ├── PROJECT_DEVELOPMENT.md     # 整体开发文档
│   ├── QUICKSTART_2026-09.md      # ← 你正在读的
│   ├── COMMERCIAL_AUDIT_*.md      # 商业化审计
│   ├── PRODUCTION_CHECKLIST.md    # 上线清单
│   ├── RUNBOOK-multi-instance.md  # 多实例运维
│   ├── DESIGN.md / I18N_MIGRATION.md / ...
├── prisma/
│   ├── schema.prisma              # DB schema
│   └── seed.ts                    # seed 脚本（30 商品 / 2 分类 / 3 用户）
├── src/
│   ├── app/
│   │   ├── (shop)/                # 前台 route group
│   │   │   ├── page.tsx           # 首页
│   │   │   ├── products/          # 商品列表 + 详情
│   │   │   ├── orders/            # 订单（list + [orderNumber]） + layout.tsx
│   │   │   ├── account/           # 账户中心 + layout.tsx
│   │   │   ├── cart/ / checkout/  # 购物车 + 结账
│   │   │   └── auth/              # 登录/注册/重置
│   │   ├── admin/                 # 后台（无 layout 包裹，独立导航）
│   │   ├── api/                   # API routes
│   │   ├── layout.tsx             # Root layout（async，<html lang={getLang()}>）
│   │   └── globals.css            # 全局样式 + CSS variables（暗色模式预留）
│   ├── components/
│   │   ├── shop/                  # 前台组件
│   │   ├── admin/                 # 后台组件
│   │   └── ui/                    # 通用 UI（button / card / dialog / pagination）
│   ├── lib/                       # 业务逻辑
│   │   ├── shop-i18n.ts / shop-i18n-server.ts  # 前台 i18n
│   │   ├── admin-labels.ts        # 后台中文 label 集中维护
│   │   ├── auth/                  # 认证
│   │   ├── prisma.ts              # prisma 单例
│   │   └── ...                    # 18+ 工具
│   ├── server/
│   │   ├── services/              # 业务 service 层
│   │   └── middleware/            # 业务中间件
│   └── types/                     # 类型定义
├── scripts/                       # 运维脚本（DB patch / 多实例）
├── tests/                         # 单测
├── Dockerfile / docker-compose.yml / deploy/nginx.conf  # 部署
├── .env.example                   # 环境变量模板
├── CHANGELOG.md                   # 30+ 项变更日志
└── README.md
```

## 3. 启动 3 步

```bash
# 1. 启动本地 PG（macOS 15.7 必须用 patched binary，见 §5.1）
bash scripts/start-dev-db.sh    # 或：node scripts/start-dev-db.mjs

# 2. 启动 Next dev（用 nohup + 重定向，不用 tee — 见 §5.8）
PORT=3000 nohup npm run dev > /tmp/next-dev.log 2>&1 &
disown
# 第一次编译每个页面 5-30s（dev 慢），第二次 < 200ms

# 3. 验证
sleep 10
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/  # 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin  # 200/307

# 杀 dev 用：
bash scripts/stop-dev.sh

# 改 schema 后（Prisma stale client）用：
bash scripts/restart-dev.sh
```

## 4. 关键数据模型

| 模型 | 用途 | 重要字段 |
|------|------|----------|
| **User** | 用户 | role: USER/ADMIN/SUPPORT, status: ACTIVE/SUSPENDED |
| **Product** | 商品 | slug, isPresale, presaleNoteZh/En, **images (JsonValue[])** |
| **ProductVariant** | 变体 | size, color, stock, price, attributes.soldOutValues |
| **Category** | 分类 | slug, name, isFeatured |
| **Order** | 订单 | orderNumber, status, addressSnapshot (JsonValue), currency |
| **Refund** | 退款 | orderId, reason, status, amount |
| **SiteSetting** | 站点设置 | key/value JsonValue（presaleNote / announcement / siteName / policyXxx） |
| **AuditLog** | 审计 | actorId, action, entity, before/after JsonValue |
| **PaymentLog** | 支付流水 | orderId, gateway, status, rawPayload |
| **Banner / Faq / LegalPage** | 内容 | title (i18n), content (i18n) |

**所有 JsonValue 字段访问时必须先 narrow**（`product.images.filter((src: unknown): src is string => ...)`）。

## 5. 环境约束与坑位（必读！）

### 5.1 macOS 15.7 + PostgreSQL 18.4 binary patch

- **问题**：macOS 15.7 上 PG 18.4 启动时 `pthread_is_threaded_np() != 0` 触发 PANIC
- **现状**：所有 homebrew pg 16/17/18 都中招
- **Workaround**：用 `embedded-postgres` npm 包自带的 PG binary，**反汇编 patch**
  ```
  0x1002e6afb: 0F 85 57 03 00 00 (jne panic) → 90 90 90 90 90 90 (NOP)
  ```
  仅 x86_64 slice（arm64 保留）
- **风险**：`npm install` 升级 `embedded-postgres` 会重置 patch → 重新执行
- **建议**：写 `scripts/start-dev-db.mjs` 启动时自检 + 自动 patch

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
  # 1. 重新 generate
  node node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js generate
  # 2. 强杀 dev（子进程 next-server 也得杀，否则 EADDRINUSE）
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

### 6.1 前台 i18n（lang-provider + shop-i18n）

- 默认 `en`，选 CNY → `zh`
- 显式选过的语言不被货币切换覆盖
- `getLang()` 决策：lang cookie > currency cookie (CNY→zh) > en
- 解决路径：`src/lib/shop-i18n-server.ts: getLang()` + `src/components/shop/currency-provider.tsx: syncLangCookie()` + `src/components/shop/lang-provider.tsx: useEffect([initialLang])`
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

## 8. 后台 AdminShell 设计规范（2026-09 重设计版）

- **设计令牌**：`.admin-theme` 作用域（仅 `/admin` 路由挂 `<html>`）——
  8px 圆角（`--radius: 0.5rem`）、柔和多层阴影（`--shadow-card` 等变量）、
  冷调浅灰底（`216 20% 96.5%`）+ 纯白卡片、近黑主色。**前台零影响**（`:root` 保持 0 圆角/纯黑白）。
- **侧边栏**：264px（展开）/ 72px（折叠）+ localStorage 持久化；折叠时文字隐藏、图标居中
- **折叠按钮**：顶栏左侧（最直观）+ 侧栏底部，双入口
- **链接行高**：36px (h-9) + 8px 圆角 + 13px 字号
- **激活态**：pill 风格 `bg-secondary` 浅灰底 + 主色文字 + 主色图标
- **顶栏**：64px (h-16) + 毛玻璃 `bg-card/80 backdrop-blur-md` + 1px 底分割 + 面包屑
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

| 项 | 风险 | 建议 |
|----|------|------|
| PG binary patch | 升级 npm 包会重置 | 写自动 patch 脚本 |
| next/* .d.ts 缺失 | typecheck 9+ 噪音 | 等真实 CI pnpm install |
| admin-labels.ts 新建但未 import | 散落中文 labelMap 未统一 | 下一轮逐页 import 替换 |
| mobile < 375px 未测 | 小屏极小屏可能溢出 | 用 Playwright 测多视口 |
| E2E 测试缺失 | 关键路径无自动化 | 加 Playwright |
| **Prisma client 缓存** | schema 改后 dev 仍用旧 client → API 500 | 加 `post-migrate` 钩子自动 generate + restart |
| **dev 进程孤儿** | kill -9 父进程后 next-server 成孤儿占端口 | 加 `stop-dev.sh` 脚本强杀父子进程 |

## 11. 上线清单（PRODUCTION_CHECKLIST.md 摘要）

- [ ] `npm run build` 通过
- [ ] `npx tsc --noEmit` 0 错（除 next/*）
- [ ] `npx vitest run` 80/80 过
- [ ] `prisma migrate deploy`（生产用 migrate，dev 库用 db push）
- [ ] `.env` 用生产值（DATABASE_URL / JWT_SECRET / CURRENCY_API_KEY）
- [ ] reverse proxy（nginx.conf）配置 CSP nonce
- [ ] Cron 任务（汇率刷新 / 库存清理 / 订单超时）注册到系统 cron
- [ ] 备份策略（PG dump 每日 + S3 上传）
- [ ] 监控（error tracking / uptime / perf）
- [ ] 灰度发布（先 10% → 50% → 100%）

## 12. 与大爷的协作偏好（梦哥笔记）

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

**下一位接手者**：请把本文读完后直接看 `SESSION_2026-09_LOGO_AND_HARDENING.md` 了解本轮详细决策。然后开干。

# 生产部署操作手册（2026）

> 面向网店交付使用的分步指南。目标读者：没有写码背景的运营者 + 维护工程师。
> 配合 `npm run preflight`（部署前自检）一起使用：先跑检查，再按本文操作。
>
> 当前代码库状态：**功能开发完成、CI 四关（lint/typecheck + unit/integration + build + E2E）已过、可生产构建**；
> 尚未接通的三个外部服务 = 邮件、真实收款、对象存储（都是配置项，不涉及改代码）。
>
> **本文档已同步至 2026-09-20（含 Phase 12 注销闭环、Phase 13 shop.x.com 照搬、B-2 原站式找回密码）。**

---

## 0. 快速判断：现在能不能上线？

在服务器上执行一次自检：

```bash
npm run preflight          # 生产模式自检（若 NODE_ENV=production）
```

它会逐项告诉你「✓ / ✗」：

| 检查项 | 红灯表示 |
|---|---|
| 环境变量 | 缺必需变量 |
| JWT 密钥强度 | 用了 dev 默认密钥（必须换） |
| PostgreSQL 可达 | 数据库没起 / URL 错 |
| migrations | 缺少 prisma/migrations（生产不能用 db push） |
| 存储驱动 | 生产仍用 local（容器重启丢图） |
| 邮件服务 | MAIL_PROVIDER=console（邮件发不出去） |
| 支付模式 | 仍 mock / Stripe 密钥未配 |
| Redis | 开了却连不上（可忽略，仅影响缓存） |

**任何 ✗ 都要按下面对应小节处理完再上线。**

---

## 1. 上线前必须做的事（按顺序）

### 1.1 域名 + HTTPS
1. 域名（如 `shop.yourbrand.com`）解析到服务器 IP
2. 用 Caddy / Nginx 自动申请 Let's Encrypt 证书
3. 把 `.env` 的 `SITE_URL` 改为 `https://shop.yourbrand.com`
4. 配置转发 `X-Forwarded-For`（TRUST_PROXY 生产默认 true）

### 1.2 换掉所有 dev 密钥（必做）
```bash
openssl rand -base64 48   # 生成 JWT_ACCESS_SECRET
openssl rand -base64 48   # 生成 JWT_REFRESH_SECRET
```
写入 `.env`，且 `REQUIRE_STRONG_SECRETS=true`（生产默认开启，密钥不合格服务拒绝启动）。

### 1.3 邮件真实外发（二选一）

**方案 A：Resend（推荐，10 分钟）**
1. 到 [resend.com](https://resend.com) 注册 → 加域名 → 按提示配 DNS（SPF/DKIM）
2. `.env`：
```env
MAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
MAIL_FROM="Your Brand <no-reply@你的域名>"
```
3. 验证：后台注册一个新用户，收验证邮件；或后台改订单状态触发「发货通知」邮件。

**方案 B：SMTP（已有邮箱服务器时）**
```env
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=465                # 465 配 SMTP_SECURE=true；587 配 false
SMTP_USER=no-reply@example.com
SMTP_PASS=********
SMTP_SECURE=true
```
> 阿里云/腾讯企业邮建议 465；QQ邮箱需「授权码」而非登录密码。
> 本地开发保留 console 即可（邮件落到 `.mail-out/`），不影响测试。
>
> ⚠️ **生产绝不能用 console**：除注册验证/发货通知外，**B-2 找回密码的临时密码邮件**
> （模板 `temp-password`）、注销确认（`account-deleted`）、注销驳回（`deletion-rejected`）
> 都依赖邮件通道。`MAIL_PROVIDER=console` 时临时密码只在后台批准弹窗里出现一次，
> 用户自己收不到 —— **必须先配好 Resend/SMTP 再对外开放找回密码**。

### 1.4 真实收款 Stripe
1. [dashboard.stripe.com](https://dashboard.stripe.com) 注册（国外卡/支持 USD）
2. `.env`：
```env
PAYMENT_MODE=stripe
STRIPE_SECRET_KEY=sk_live_...          # 上线前用 sk_test_… 先沙盒跑通
STRIPE_WEBHOOK_SECRET=whsec_...
```
3. Stripe 后台 → Developers → Webhooks 新增：
   - URL：`https://你的域名/api/webhooks/stripe`
   - 事件：`checkout.session.completed`、`payment_intent.succeeded`
   - 记下 `whsec_` 签名密钥填入环境
4. 沙盒验证：用 Stripe 测试卡 `4242 4242 4242 4242` 走完一单 → 订单状态变为已支付
5. 国内收款备选：六渠道三态（未配置 / 已配置 / 可收款），alipay / wechat / bankcard / paypal 为**预留级**——
   `createPayment` 明确提示「尚未接入真实下单请求」而非误扣款；国内三网关声明 `supportedCurrencies=["CNY"]`，
   非 CNY 结算会被置灰（渠道×币种校验，服务端同口径兜底）。

> 也可**不写 .env 的 Stripe 密钥**：后台 `/admin/payment-channels` 给 Stripe 渠道填 `sk_` / `whsec_` / `pk_`
> 即真实收款（渠道密钥优先，env 自动回落），前台 `available = enabled + configured + ready`——
> 预留渠道即使配置并启用也显示「暂未开通」，顾客不可能选到必然失败的方式。

### 1.4b 分销 / 多级佣金（隔离模块，可整体关闭）

1. **迁移**：`npx prisma migrate deploy` 会应用 `20260920185628_distribution_module`
   （新增 7 张 `distribution_*` / `commission_*` / `distributor_*` / `withdraw_*` / `order_attributions` 表
   + `users` 上 6 个分销字段）。**不需要**手工插规则：第一次计佣会自动补齐默认三级 10/5/2。
2. **总开关**：`DISTRIBUTION_ENABLED=false` 即可整体下线（代理层不写推广 cookie、钩子零开销、
   API 全 404、入口隐藏），商城行为与未装该模块一致。未设置=默认开启。
3. **后台配置**：`/admin/distribution/rules` 调层级比例与策略（绑定触发点、是否允许抢绑、
   绑定有效期、返佣层级上限、**总比例上限**、自购开关、结算持有期、最低提现金额）。
   ⚠️ **总返佣比例务必 ≤ 毛利率的 60%**，配错会直接把利润返穿；页面已内置上限校验。
4. **提现是一期口径：线下打款**。平台审核通过后由财务线下转账，再回后台点「标记已打款」
   （可填打款凭证号）。**代码不做自动代付** —— 自动代付需要主体资质 + 收款人实名(KYC) + 代扣代缴个税，
   不是配置项能解决的。
5. **佣金正确性由对账兜底**：调度器每分钟跑 `reconcileDistribution()`
   （补归属 / 补计佣 / 冲正退款单 / 到期结算），后台「分销 → 总览」也有「立即对账」按钮。
   因此即使某个钩子漏调也不会错账；但**上线后请先跑一单真实流程核对佣金金额**。
6. **合规红线（系统已硬编码，别绕过）**：只按真实订单返佣（没有任何按人头/按注册量发钱的入口）、
   层级上限与总比例上限可配、不收入门费/不囤货解锁；`selfPurchaseCommission` 默认关闭。
   若面向中国大陆客群，多级计酬的合规风险评估请先过法务 —— 系统限制了参数，不能替代法律意见。

### 1.5 图片/素材对象存储（必做，容器部署）
本地磁盘在容器里会随容器销毁丢文件，必须 S3 兼容对象存储：

**Cloudflare R2（推荐，免流量费）** 或 **阿里云 OSS** 或 **AWS S3**：
```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # 或 OSS endpoint
S3_REGION=auto
S3_BUCKET=ecommerce
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_URL=https://cdn.yourbrand.com                     # 配 CDN/自定义域
S3_FORCE_PATH_STYLE=true
```
> 存量图片迁移：把 `storage/uploads/` 上传到 bucket 的 `uploads/` 目录即可
> （DB 中存的是 `/api/uploads/...` 相对路径，前端会用 `SITE_URL` 拼站内访问；
>  若想走 CDN 需要一次 UPDATE 把字段前缀替换成 CDN 地址——建议上线前先干净数据）。

### 1.6 部署形态（推荐 Docker Compose）
项目自带 `Dockerfile` 与 `docker-compose.yml`（生产模板）+ `docker-compose.local.yml`（演示覆盖）。
生产建议：

```bash
# 服务器上
git pull
docker compose -f docker-compose.yml up -d --build
docker compose exec app npx prisma migrate deploy   # 应用数据库迁移（勿用 db push）
docker compose exec app npm run db:seed             # 首次才需要（已有数据跳过）
```

> 多实例扩展：定时任务已用 PG 咨询锁做选主，库存扣减已用行锁，可直接横扩。

---

## 2. 上线验收清单（部署完逐项打勾）

### 前台
- [ ] 首页/集合索引/集合页/商品详情图正常；旧链接 `/products?category=x` 能 307 跳到 `/collections/x`
- [ ] 注册新账号 → 收到**真实**验证邮件（验证 Resend/SMTP）
- [ ] 登录 → 加购物车 → 结算（Stripe 沙盒卡走通）
- [ ] **游客结账**：未登录也能加购 → 四步结账 → 下单 → 带 `orderToken` 跳支付 → 支付成功 → 结果页
- [ ] 支付成功后订单出现在「我的订单」，状态=已支付
- [ ] **找回密码（B-2 人工审批）**：前台提交申请 → 后台「找回密码」批准 → 收到临时密码邮件 →
      用临时密码登录 → 被强制跳到改密页 → 改密后恢复正常
- [ ] 通知（补货提醒等）能收到站内信 + 邮件
- [ ] 账户注销申请：提交后看到在途状态卡、可自助撤回

### 后台
- [ ] 登录后台，Dashboard 有数据（含「各币种销售汇总」卡）
- [ ] 新订单会出现在后台（顶部未读角标 +1）
- [ ] 商品上架/改库存/改价正常；**批量删除**可用
- [ ] 上传图片走对象存储，且归档到 `uploads/{categories|products|brand|misc}/年/月/`（日志无 local 写入）
- [ ] 后台「消息中心」收到订单/退款/新用户/**找回密码申请**通知
- [ ] 「找回密码」页批准/驳回可用，批准弹窗一次性回显临时密码（DB 不回显历史）
- [ ] 「用户」页：注销申请筛选 + 红徽标 + 处理块（确认注销后旧会话立即失效、旧邮箱登录失败）
- [ ] 联系表单留言落库 + 通知邮件到达 `contactEmail`（当前无独立收件箱页）
- [ ] **分销**：用带 `?ref=` 的链接注册新账号 → 推荐人自动成为分销商 → 该客户下单支付 →
      后台「分销 → 佣金流水」出现按层级比例的佣金 → 确认收货后转为可提现 → 该订单退款后佣金冲正
- [ ] 分销后台「我的推广」能拿到推广链接/二维码；「我的客户」里手机号显示为 `138****1234`
- [ ] 提现闭环：分销商申请 → 后台审核通过 → 线下打款 → 标记已打款（冻结核销）/ 驳回（解冻退回）

### 安全
- [ ] 全站 HTTPS，访问 `http://` 自动跳 https
- [ ] 部署前把 JWT 换成了随机 32+ 位（非 dev 默认）
- [ ] `REQUIRE_STRONG_SECRETS=true`
- [ ] 审计日志（后台→审计）能查到登录/下单/批准找回密码（`ADMIN_PASSWORD_RESET_APPROVE`）/注销（`ADMIN_USER_DELETION_APPROVE`）记录
- [ ] 找回密码双限流生效（IP 3/min、单邮箱 3/h），前台回执不泄露邮箱是否注册（防枚举）
- [ ] 临时密码登录后**手删 `pwd_change_required` cookie 也绕不过**（DB 侧 `requireUser()` 抛 403 `PASSWORD_CHANGE_REQUIRED`）

### 运维
- [ ] `npm run preflight` 生产模式全绿
- [ ] 数据库已做备份（见 §3）
- [ ] 确认容器可重启后图片不丢（存储已切 S3）

---

## 3. 备份与恢复

### 每日自动备份（可选 cron）
```bash
0 3 * * * cd /path/to/app && bash scripts/backup-db.sh   # 详见脚本内配置
```

### 手动备份
```bash
docker compose exec -T postgres pg_dump -U ecommerce -Fc ecommerce > backup-$(date +%F).dump
```

### 恢复
```bash
docker compose exec -T postgres pg_restore -U ecommerce -d ecommerce --clean < backup-2026-09-01.dump
```

---

## 4. 日常运维速查

| 场景 | 命令 |
|---|---|
| 查看日志 | `docker compose logs -f app` |
| 重启服务 | `docker compose restart app` |
| 改配置后重载 | `docker compose up -d`（会重建变更容器） |
| 看自检 | `npm run preflight` |
| 应用新迁移 | `npx prisma migrate deploy` |
| 备份数据库 | `bash scripts/backup-db.sh` |
| 磁盘排查 | `df -h` / `docker system df` |

---

## 5. 常见问题（FAQ）

**Q1 邮件发不出？**
→ `.env` 里 `MAIL_PROVIDER` 还是 console；检查 Resend/SMTP 配置 + DNS 验证（§1.3）。

**Q2 图片上传报「请填写合法的图片 URL」？**
→ 本地开发走 `/api/uploads/...` 相对路径已被代码放行（2026-09 修复）；若在旧版本出现，说明缓存旧代码，重启服务。

**Q3 分类保存提示 URL 错误？**
→ 同上，属于本地存储相对路径与校验的兼容修复，已处理；更新代码后重启即可。

**Q4 商品加载 500？**
→ 通常是数据库表结构落后于代码：`npx prisma migrate deploy` 应用最新迁移（勿用 db push）。

**Q5 通知「消息中心」删不掉？**
→ 2026-09 已加删除功能（单条/清空已读/清空全部）。若按钮 405，是 dev server 缓存，重启即可。

**Q6 微信/支付宝收款？**
→ 后台 `/admin/payment-channels` 已预留给 alipay/wechat/bankcard/paypal（参数组装就绪，`createPayment` 明确提示「尚未接入真实下单请求」）；要真实收款需接对应网关或选 Stripe 渠道（填 `sk_`/`whsec_` 即用）。国内三渠道仅支持 CNY。

**Q7 客户说收不到找回密码的临时密码？**
→ 九成是 `MAIL_PROVIDER=console`（邮件只写日志不投递）。处理：① 配置 Resend/SMTP（推荐，见 §1.3）；
② 若申请还是**待处理**，管理员批准时把弹窗里的**一次性明文临时密码**当面/电话转达给客户（弹窗关闭后无法再取，DB 只存哈希）；
已批准过的申请不能重复批准，可改用后台「用户」页的管理员重置密码能力（`PUT /api/admin/users/[id]/password`，重置后该用户会话全部失效）或让客户重新提交申请。

**Q8b 分销佣金是 0 / 分销页面打不开？**
→ ① 先看 `DISTRIBUTION_ENABLED` 是否为 `false`（该值下分销 API 全部 404、入口隐藏，这是预期行为）；
② 若是「订单已支付但佣金为 0」，检查 `/admin/distribution/rules` 是否有启用的规则
（正常会自动补齐默认三级；被手工删空就会算 0）；
③ 到 `/admin/distribution` 点「立即对账」——它会把漏记的归属与佣金补齐（幂等）。

**Q8c 分销商提现需要打钱，系统会自动转账吗？**
→ 不会，也不建议一期就接。现在的口径是「申请 → 平台审核 → 线下打款 → 回后台标记已打款」。
自动代付需要主体资质、收款人实名(KYC) 与代扣代缴个税，属于业务与法务决策，不是配置项。

**Q8 客户登录后被强制跳到改密页，是 bug 吗？**
→ 不是。管理员批准找回密码后账号被置 `mustChangePassword`，中间件用 cookie `pwd_change_required` 把用户钉在 `/auth/change-password`（其它页面 307、其它 API 403 `PASSWORD_CHANGE_REQUIRED`），DB 侧 `requireUser()` 也做兜底。改密成功（`PUT /api/user/password`）即清除标记与 cookie，恢复正常。

---

## 附：本次交付新增内容一览

| 内容 | 说明 |
|---|---|
| `scripts/preflight-check.ts` | 部署前自检（npm run preflight） |
| `src/types/next-shims.d.ts` | Next 16 内部版缺类型声明的 typecheck 兜底 |
| 后台消息中心删除 | 单条/清空已读/清空全部（2026-09） |
| 前台账户「消息」菜单入口 | `/orders` 与 `/account` 左侧导航统一补 bell 入口 |
| 顶栏 LOGO | 统一 44px 等比例 + object-contain 防变形 |
| **B-2 原站式找回密码** | `PasswordResetRequest` + `/admin/password-resets` + 14 位强随机临时密码 + 首登强制改密（迁移 `20260919233506_password_reset_requests`） |
| **Phase 12 注销闭环** | `User.deletionRequestedAt` + `/admin/users` 处理块（匿名化/驳回）；`DELETE /api/admin/users/[id]` 直接删除 |
| **Phase 13 游客结账** | `src/lib/guest-cart.ts` + `GET /api/cart/preview` + `orderToken` 随 paymentUrl 传递 |
| **上传按用途归档** | `uploads/{categories\|products\|brand\|misc}/年/月/`（本地/S3 同结构） |
| **联系表单留言** | `ContactMessage` 落库 + `contactEmail` 通知（迁移 `20260919082929_add_contact_messages`） |
| **商品批量删除** | `POST /api/admin/products/batch-delete` |
| **Phase 14 分销 / 多级佣金** | 闭包表 + 归属绑定 + 逐级分佣 + 提现；商城侧仅 `distribution/bridge.ts` 一个接口面，`DISTRIBUTION_ENABLED=false` 可整体下线（迁移 `20260920185628_distribution_module`） |

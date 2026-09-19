# 生产部署操作手册（2026）

> 面向网店交付使用的分步指南。目标读者：没有写码背景的运营者 + 维护工程师。
> 配合 `npm run preflight`（部署前自检）一起使用：先跑检查，再按本文操作。
>
> 当前代码库状态：**功能开发完成、CI 三关（lint/typecheck/unit）已过、可生产构建**；
> 尚未接通的三个外部服务 = 邮件、真实收款、对象存储（都是配置项，不涉及改代码）。

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
5. 国内收款备选：预留了 `PAYMENT_MODE` 扩展位，接入微信/支付宝需另接网关（本文不展开）

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
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec app npx prisma migrate deploy   # 应用数据库迁移（勿用 db push）
docker compose exec app npm run db:seed             # 首次才需要（已有数据跳过）
```

> 多实例扩展：定时任务已用 PG 咨询锁做选主，库存扣减已用行锁，可直接横扩。

---

## 2. 上线验收清单（部署完逐项打勾）

### 前台
- [ ] 首页/商品列表/商品详情图正常（CDN 域名）
- [ ] 注册新账号 → 收到**真实**验证邮件（验证 Resend/SMTP）
- [ ] 登录 → 加购物车 → 结算（Stripe 沙盒卡走通）
- [ ] 支付成功后订单出现在「我的订单」，状态=已支付
- [ ] 忘记密码 → 收到重置邮件 → 能改密
- [ ] 通知（补货提醒等）能收到站内信 + 邮件

### 后台
- [ ] 登录后台，Dashboard 有数据
- [ ] 新订单会出现在后台（顶部未读角标 +1）
- [ ] 商品上架/改库存/改价正常
- [ ] 上传图片走对象存储（日志无 local 写入）
- [ ] 后台「消息中心」收到订单/退款/新用户通知

### 安全
- [ ] 全站 HTTPS，访问 `http://` 自动跳 https
- [ ] 部署前把 JWT 换成了随机 32+ 位（非 dev 默认）
- [ ] `REQUIRE_STRONG_SECRETS=true`
- [ ] 审计日志（后台→审计）能查到登录/下单记录

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
→ 代码预留 `PAYMENT_MODE` 扩展点；需自行接入对应网关（或选 Stripe 国际版）。

---

## 附：本次交付新增内容一览

| 内容 | 说明 |
|---|---|
| `scripts/preflight-check.ts` | 部署前自检（npm run preflight） |
| `src/types/next-shims.d.ts` | Next 16 内部版缺类型声明的 typecheck 兜底 |
| 后台消息中心删除 | 单条/清空已读/清空全部（2026-09） |
| 前台账户「消息」菜单入口 | `/orders` 与 `/account` 左侧导航统一补 bell 入口 |
| 顶栏 LOGO | 统一 44px 等比例 + object-contain 防变形 |

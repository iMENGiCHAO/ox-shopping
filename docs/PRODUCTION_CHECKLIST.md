# 商用部署检查清单（商用化最后一关）

> 本文档作为本店从「开发完成」到「正式商用」的最后一道闸门。
> 由顶级架构师审查后整理，2026-08-22 版本（2026-08-25 安全加固修订，2026-09-18 去硬编码修订）。
> 所有项逐一过一遍再放量。
>
> 品牌名不在此文档写死：全站品牌来自 `SITE_NAME` 环境变量（运行时可由后台「站点设置」
> 覆盖），代码侧单一回退源为 `src/lib/env.ts` 的 `brandFallback`。

---

## 〇、2026-08-25 加固说明（本次已内置，部署时知晓即可）

- **弱密钥拒启**：`NODE_ENV=production` 时若 JWT 密钥为默认值或长度 <32，服务**拒绝启动**（构建期仅告警）。
  本地一键演示需在 compose 中显式 `REQUIRE_STRONG_SECRETS=false`。
- **种子安全**：演示账号(admin/user/support@example.com)仅开发环境写入；生产环境用 `npm run admin:create -- <email> '<password>'` 创建首个管理员。
  种子不再清空商品表——重复执行只补缺失条目，绝不覆盖运营数据；强制重建须显式 `FORCE_RESEED=true`（仅限开发）。
- **进程内定时任务**：订单超时取消 / 过期 Token 清理 / Stripe 掉单对账(webhook 丢失→补标记)每分钟自动执行；
  多实例经 Postgres 咨询锁选主。`CRON_ENABLED=false` 可关闭。
- **库存一致性**：规格级库存(specStock)下单事务内行锁扣减、不足整单失败；预售按实扣量记录(stockDeducted/specDeducted)，取消精确回补。
- **退款封顶**：累计退款 ≤ 订单总额；同一申请不可重复审批；部分退款不改变整单状态；网关退款单号落库。
- **支付幂等**：`markOrderPaid` 以 `PENDING_PAYMENT → PAID` 条件更新原子认领，
  支付回调 / 模拟支付 / 掉单对账三路并发只有一次生效，副作用（资金流水 / 确认信 / 审计 /
  管理员通知）只跑一次；整单退款同理（外层幂等 + 事务内行锁二次校验 + 条件更新），
  杜绝重复发起网关退款。
  > 注（2026-09-18 已过时，保留以便追溯）：本文档曾记载「本项目没有优惠券体系」。
  > 优惠券已于 2026-09-18 完整落地（`Coupon` / `CouponRedemption` 模型、券计数 `usageLimit`
  > 与 `usedCount`、每人限次 `perUserLimit`、领券中心 `/coupons`、我的券 `/account/coupons`、
  > 后台 `/admin/coupons`），该结论**不再成立**。券相关上线检查项见 §三之二。

---

## 一、必须配置的环境变量（缺一项就不该上线）

| 变量 | 示例 | 用途 |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/ecommerce` | PostgreSQL 16 |
| `REDIS_URL` | `redis://:pass@host:6379/0` | 限流/缓存（建议必须，关了会退回内存版） |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `openssl rand -base64 48` | JWT 双密钥，**生产必须独立随机（<32 位将拒绝启动）** |
| `SITE_URL` | `https://shop.example.com` | 邮件/回跳绝对地址 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | `sk_live_...` / `whsec_...` | 不配则全站走 mock 支付 |
| `S3_*` (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) | Cloudflare R2 / MinIO | 不配则上传本地磁盘（不能横向扩容） |
| `RESEND_API_KEY` 或 `SMTP_*` | - | 不配则邮件进 `.mail-out/` 本地文件 |
| `SENTRY_DSN` | `https://...@sentry.io/...` | 可选但强烈建议 |
| `NEXT_PUBLIC_CDN_URL` | `https://cdn.example.com` | 图片静态加速 |

任何一项缺省都有兜底，但兜底≠商用级。上表逐项打勾再上线。

## 二、域名 / HTTPS / Cookie

- 平台必须有 HTTPS，否则 `Secure` Cookie 不会写入
- 生产模式 `sameSite=lax` + `secure: true` 已硬编码，无需改
- 如走 Cloudflare/CloudFront，确认 `X-Forwarded-Proto`/`X-Forwarded-Host` 透传（`next.config.js` 中 `trustHostHeader: true`）

## 三、数据库

```bash
# 一次性初始化
npm run db:deploy       # 生产迁移（不是 db:push）
npm run admin:create -- admin@yourdomain.com 'StrongPass!2026'   # 生产首个管理员（勿用 seed 的演示账号）
```

- 启用每日逻辑备份 + WAL 归档
- `AuditLog` 写得比较频（每小时千行级），建议 90 天滚动归档
- 慢查询：开启 `log_min_duration_statement = 500ms` 观察一周

### 三之二、优惠券上线检查项（2026-09-18 新增体系）

券涉及**钱**，比普通 CRUD 多几处必须人工确认的点：

- [ ] **金额复算在服务端**：结账页的试算是提示值，最终 `discount` 必须由下单事务内重算。
      改价（券规则 / 商品价）后不能沿用前端传回的金额。
- [ ] **门槛与封顶**：`minSpend` 按**商品小计**判定（不含运费）；`PERCENTAGE` 券的
      `maxDiscount` 为 `null` 时**不封顶**——运营配错会放大损失，公开券建议强制填封顶。
- [ ] **总量上限 `usageLimit`**：`0` 表示不限量。限量券靠事务内 `usedCount` 自增做原子扣减，
      多副本并发下不会超发。
- [ ] **每人限次 `perUserLimit`**：登录用户按 `userId` 计，**游客按 `email` 计**。
      游客换邮箱即可绕过——若某券是「一人一次」性质（如新人券），
      应同时在文案与风控上考虑（本项目当前接受该风险，未做设备指纹）。
- [ ] **停用 vs 删除**：已有核销记录的券**删不掉**（`DELETE` 返回 400），这是刻意的——
      `coupon_redemptions` 是历史订单优惠来源的唯一凭证。要下架请关 `isActive`。
- [ ] **总量上限不得低于已核销数**：`PUT` 会拦截（否则出现「已用 10 次但上限 5」的矛盾态）。
- [ ] **回补口径**：以下三条路径会在同一事务内 `usedCount--` 并删除核销记录（券可再用）——
      ① 取消订单 `cancelOrder`；② 整单退款 `refundEntireOrder`；
      ③ 网关侧退款同步 `markOrderRefundedByGateway`（Stripe 后台手动退款或部分退款累计到全额时）。
      **部分退款不回补**：订单仍是 `PAID`，券视为已消费。若业务上要求「部分退款也按比例退券」，
      需在此处显式改（当前不做，因为按比例退券在语义上无法表达）。
- [ ] **公开露出**：`isPublic = true` 的券会出现在 `/coupons` 领券中心，且**必须填标题**
      （中英至少一项），否则前台是空白卡片——校验已拦在录入阶段。
- [ ] **审计**：创建 / 修改 / 启停 / 删除均写 `AuditLog`（`ADMIN_COUPON_*`），上线后抽查几条。

## 四、Redis

- 商用必须开 `REDIS_URL`，不开时 `lib/redis.ts` 退化为内存限流/缓存——单进程有效，多副本部署会穿透

## 五、Stripe Webhook

```bash
stripe listen --forward-to https://shop.example.com/api/webhooks/stripe
# 把输出的 whsec_... 写进 STRIPE_WEBHOOK_SECRET
```

- 必须验证签名（代码已实现），不能只验参
- 订阅事件：`checkout.session.completed`, `payment_intent.succeeded`, `charge.refunded`

## 六、对象存储（S3）

- 商用选 Cloudflare R2（零出口流量费）或 AWS S3
- Bucket Policy：私有写、公开读（通过 CDN），`presign url` 上传
- 每次部署后 smoke 测试一张图片上传

## 七、CDN / 静态资源

- `/uploads/*` 与 `/_next/static/*` 必须走 CDN
- `_next/static` 自带强缓存，可设 1 年
- 图片建议用 Next Image + sharp（已配），输出 webp/avif

## 八、监控 / 日志 / 告警

- Sentry：`SENTRY_DSN` + `SENTRY_ENVIRONMENT=production`，400/500 自动上报
- pino 结构化日志，生产环境用 JSON 输出到 ELK / Loki
- 必须告警：
  - HTTP 5xx 率 > 1%/5min
  - 队列：`/api/webhooks/stripe` 失败率
  - 磁盘：上传目录剩余 < 20%

## 九、限流 / 安全

已内置（不用动代码）：
- 登录：5 次/分钟/IP + 5 次/分钟/邮箱
- 注册/重置密码/发送验证码：3 次/分钟
- 管理端写操作：30 次/分钟
- 公开列表：120 次/分钟
- CSRF double-submit、JWT Refresh 重放检测、bcrypt cost=12
- CSP、X-Frame-Options=DENY、X-Content-Type-Options=nosniff

## 十、性能预算（已实测）

- First Load JS：87.5 kB（共享）+ 页级几十 kB
- Lighthouse 目标：Perf > 90, A11y > 95, SEO > 95
- 首屏 LCP < 2.5s（4G），详情图已用 sharp 压缩到 < 200KB

## 十一、上线前最后一遍功能走查（每条必须人跑一次）

```
□ 注册 / 邮箱验证 / 忘记密码（真实 SMTP）
□ 商品列表/详情/搜索/筛选/分页
□ 加购（游客）→ 登录合并
□ 多币种切换（汇率实时）
□ 结算 → Stripe Checkout → Webhook 改状态
□ 订单详情页发票 PDF 下载（中文字体）
□ 申请退款 → 管理端审核 → 退款成功邮件
□ 管理端：建 SKU / 上下架 / 改库存 / 看审计日志
□ 移动端 375px / iPad 768px / 桌面 1440px
□ 中文 + English 双语切换不丢字
□ 关闭 Redis 启动 → 有降级日志不崩溃
```

## 十二、回滚预案

- Docker 镜像打 `git sha` 标签，保留最近 10 个
- DB 迁移只前滚不后滚；失败立即从备份恢复
- Stripe 密钥泄漏：立刻在 Stripe Dashboard roll key，重启换环境变量

## 十三、CI/CD（已有）

`.github/workflows/ci.yml`：typecheck → lint → unit → integration → build → docker build push。
建议加一步 `npm run test:e2e`（已在 CI 就绪，需配 postgres service）。

---

**判定规则**：上述检查清单 100% 全绿，才允许把生产密钥写进环境。任何一项不绿，只能跑演示/内测。

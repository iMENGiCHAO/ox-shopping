# 商用部署检查清单（商用化最后一关）

> 本文档作为 **星辰商城** 从「开发完成」到「正式商用」的最后一道闸门。
> 由顶级架构师审查后整理，2026-08-22 版本。所有项逐一过一遍再放量。

---

## 一、必须配置的环境变量（缺一项就不该上线）

| 变量 | 示例 | 用途 |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/ecommerce` | PostgreSQL 16 |
| `REDIS_URL` | `redis://:pass@host:6379/0` | 限流/缓存（建议必须，关了会退回内存版） |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `openssl rand -base64 48` | JWT 双密钥，**生产必须独立随机** |
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
npm run db:seed         # 可选：首批演示商品
```

- 启用每日逻辑备份 + WAL 归档
- `AuditLog` 写得比较频（每小时千行级），建议 90 天滚动归档
- 慢查询：开启 `log_min_duration_statement = 500ms` 观察一周

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
□ 优惠券应用
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

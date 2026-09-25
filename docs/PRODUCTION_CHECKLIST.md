# 商用部署检查清单（商用化最后一关）

> 本文档作为本店从「开发完成」到「正式商用」的最后一道闸门。
> 由顶级架构师审查后整理，2026-08-22 版本（2026-08-25 安全加固修订，2026-09-18 去硬编码修订，
> **2026-09-20 补 Phase 12 注销闭环 / Phase 13 上游参考站 照搬 / B-2 找回密码**）。
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

## 〇之二、2026-09-20 修订说明（本轮新增能力，部署时知晓即可）

- **B-2 原站式找回密码（人工审批）**：前台提交申请（`POST /api/auth/forgot-password`，防枚举 + 单 IP 3/min + 单邮箱 3/h）
  → 后台 `/admin/password-resets` 批准/驳回 → 批准生成 14 位强随机临时密码（`src/lib/auth/temp-password.ts`，CSPRNG + 拒绝采样 + 剔除 `0O1lI`）
  → bcrypt 入库 + `mustChangePassword=true` + 吊销该用户全部会话 + 邮件 `temp-password` 下发明文（响应里一次性回显给管理员兜底，DB 不存明文）。
  首登被 `proxy.ts`（cookie `pwd_change_required`）+ `requireUser()` 双重门控钉在 `/auth/change-password`，改密走既有 `PUT /api/user/password`。
  **运维红线：`MAIL_PROVIDER=console` 时临时密码邮件不会真正投递，生产必须配 resend/smtp，否则找回密码对用户不可用。**
- **Phase 12 账户注销闭环**：`User.deletionRequestedAt`；用户提交/撤回（`POST`/`DELETE /api/user/deletion-request`）→ 管理员在 `/admin/users` 处理
  （`POST /api/admin/users/[id]/deletion`：approve=匿名化 `deleted-{id}@invalid.local` + 停用 + 吊销全部会话；reject=清空 + 邮件告知）。
  另有 `DELETE /api/admin/users/[id]` 后台直接删除（不能删自己 / 不能删最后一个管理员 / 已注销幂等）。
  **匿名化软删保留订单等财务合规数据。**
- **Phase 13 上游参考站 照搬**：`/products` 与 `/collections` 同为 All collections 索引 + 新增 `/collections/[slug]`，
  旧链接 `/products?category=x` 由 `src/proxy.ts` 307 迁移；店铺页脚 6 条 / checkout 页脚 3 条；`/pages/terms-and-conditions` 新路径；
  **游客免登录结账**（`src/lib/guest-cart.ts` + `GET /api/cart/preview` + `orderToken` 随 paymentUrl 传递）。
- **Phase 14 分销 / 多级佣金（隔离模块）**：闭包表无限级关系 + 客户归属绑定（首次绑定定终身、复购自动归属、
  **不可抢绑**由 `customerId` 唯一约束保证、自然流量不分佣）+ 首次成功推广自动成为分销商 +
  按真实订单逐级分佣（默认三级 10/5/2，层级与**总比例上限**可配）+ 退款冲正 + 确认收货结算 +
  提现申请/审核/线下打款 + 分销商后台 + 平台后台 + 行级权限与脱敏。
  商城侧只通过 `src/server/services/distribution/bridge.ts` 一个接口面接入（动态 import + try/catch），
  **`DISTRIBUTION_ENABLED=false` 可整体下线**且商城行为不变；佣金正确性由调度器分钟级
  `reconcileDistribution()` 兜底（漏记归属/漏计佣/漏冲正会被扫平）。
  **合规红线**：只按真实订单返佣（无按人头计酬入口）、总返佣比例务必 ≤ 毛利 60%、不收入门费；
  面向大陆客群的多级计酬请先过法务。
- **后台**：六渠道三态（未配置/已配置/可收款）、渠道×币种校验、客户累计消费/最近下单/未验证筛选、
  到货提醒商品卡邮件、联系表单留言 `ContactMessage` 落库、FAQ 双语（`Faq.questionEn/answerEn`）、
  商品批量删除、上传按用途归档 `uploads/{categories|products|brand|misc}/年/月/`。

---

## 一、必须配置的环境变量（缺一项就不该上线）

| 变量                                                                                                      | 示例                                                       | 用途                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`                                                                                            | `postgresql://user:<url-encoded-pass>@host:5432/ecommerce` | PostgreSQL 16；密码特殊字符必须 URL 编码             |
| `REDIS_URL`                                                                                               | `redis://:<url-encoded-pass>@host:6379/0`                  | 生产必须启用且带密码；多实例限流/缓存一致性          |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                                                                | `openssl rand -base64 48`                                  | JWT 双密钥，**生产必须独立随机（<32 位将拒绝启动）** |
| `PAYMENT_CHANNEL_ENC_KEY`                                                                                 | `openssl rand -base64 48`                                  | 渠道密钥加密主密钥；生产必填                         |
| `SITE_URL` / `SITE_NAME` / `MAIL_FROM`                                                                    | `https://shop.example.com` / 品牌 / 发件地址               | 绝对链接、发票/SEO 与真实邮件投递                    |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                                                             | `sk_live_...` / `whsec_...`                                | 真实收款；生产 mock 会在启动/preflight 被拒绝        |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PUBLIC_URL` | Cloudflare R2 / OSS / AWS                                  | 六项必须齐全；缺任一项生产拒绝启动，不降级 local     |
| `RESEND_API_KEY` 或 `SMTP_*`                                                                              | -                                                          | **找回密码依赖真实邮件；生产禁止 console**           |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE`                                                    | Sentry 项目 DSN / `production` / git SHA                   | 5xx 告警与发布定位                                   |
| `TZ` / `APP_TIMEZONE`                                                                                     | `UTC`                                                      | 容器时区与显式 IANA 时区；两者须一致                 |
| `DISTRIBUTION_ENABLED`                                                                                    | `true` / `false`                                           | 分销模块总开关；`false` = API 全 404、入口隐藏       |

开发环境可以有降级兜底，**生产没有 local 存储/console 邮件/mock 支付兜底**。逐项打勾再上线。

## 二、域名 / HTTPS / Cookie

- 平台必须有 HTTPS，否则 `Secure` Cookie 不会写入
- 生产模式 `sameSite=lax` + `secure: true` 已硬编码，无需改
- 如走 Cloudflare/CloudFront，确认 `X-Forwarded-Proto`/`X-Forwarded-Host` 透传，且反代覆盖写入 `X-Forwarded-For`（`TRUST_PROXY=true` 的部署契约；Next 16 无需、也不存在 `next.config.js` 的 `trustHostHeader` 字段——构建产物恒为 false）

## 三、数据库

```bash
# 一次性初始化
npm run db:deploy       # 生产迁移（不是 db:push）
npm run admin:create -- admin@yourdomain.com 'StrongPass!2026'   # 生产首个管理员（勿用 seed 的演示账号）
```

- 每日逻辑备份已由 compose 的 `db-backup` 侧车自动执行（pg_dump → gzip → SHA-256，保留 `BACKUP_RETAIN_DAYS` 天，卷 `dbbackups`）；**仍需**把卷内容每日同步到异地对象存储，并配置备份失败告警（宿主机 cron 方案可用 `scripts/backup-db.sh`）
- 每季度在**空临时库**运行 `scripts/restore-db.sh` 恢复演练，记录 RPO/RTO；禁止以生产库做首次恢复
- `AuditLog` 写得比较频（每小时千行级），scheduler 默认保留 3 年（1095 天）后清理；更严格合规市场按当地法务上调窗口或改为归档导出，归档与备份策略必须一并演练
- 慢查询：开启 `log_min_duration_statement = 500ms` 观察一周
- [ ] `/api/healthz`（livez）返回 200 且不依赖 DB；`/healthz`（readyz）真实查询 DB，故障时返回 503

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

- Sentry：配置合法 `SENTRY_DSN`、`SENTRY_ENVIRONMENT=production`、`SENTRY_RELEASE=<git SHA>`；上线前触发受控异常验收
- 禁止采集请求体、Cookie 和默认 PII；日志/错误上下文先脱敏
- pino 输出 JSON 到 ELK / Loki；`TZ` 与 `APP_TIMEZONE` 必须一致并在变更单记录
- 必须告警：
  - HTTP 5xx 率 > 1%/5min
  - 队列：`/api/webhooks/stripe` 失败率
  - 磁盘：上传目录剩余 < 20%

## 九、限流 / 安全

已内置（不用动代码）。**以下数值以 `src/**/route.ts` 里的 `rateLimit({...})` 调用为准（2026-09-20 逐条核对）**：

- **登录**：单 IP+单邮箱 5 次/分钟；同一邮箱跨 IP 连错 5 次锁 **15 分钟**（账号级 `login-lock`，成功登录即解锁）。后台登录带 `scope:"admin"`，非 ADMIN/SUPPORT 直接 403（不建会话）
- **注册**：单 IP 3 次/分钟 + 全局 100 次/小时；另有蜜罐字段（`company` 非空静默拒绝）
- **找回密码申请（B-2）**：单 IP 3 次/分钟 + 单邮箱 3 次/小时；同一账号同时只允许一份在途申请
- **重置密码（token 流程）**：单 IP 10 次/小时；**邮箱验证重发**：单用户 3 次/10 分钟
- **联系表单**：单 IP 5 次/小时，蜜罐命中静默丢弃；**到货提醒订阅**：单邮箱 5 次/小时
- **下单创建**：单用户 5 次/10 分钟；**优惠券应用**：20 次/10 分钟；**模拟支付**：单订单 10 次/分钟
- **会话刷新**：单 IP 10 次/分钟（另含 refresh token 重放检测与 60s 并发宽限）
- CSRF double-submit、JWT Refresh 重放检测、bcrypt cost 默认 12（`BCRYPT_ROUNDS` 可调，**生产低于 10 拒绝启动**）
- **强制改密门控**：临时密码首登被 `pwd_change_required` cookie + `requireUser()` 双重限制（见 §〇之二）
- CSP、X-Frame-Options=SAMEORIGIN（`next.config.js` 与 `deploy/nginx.conf` 均为 SAMEORIGIN，如需 DENY 两处必须同改）、X-Content-Type-Options=nosniff

## 十、性能预算（已实测）

- First Load JS：87.5 kB（共享）+ 页级几十 kB
- Lighthouse 目标：Perf > 90, A11y > 95, SEO > 95
- 首屏 LCP < 2.5s（4G），详情图已用 sharp 压缩到 < 200KB

## 十一、上线前最后一遍功能走查（每条必须人跑一次）

```
□ 注册 / 邮箱验证（真实 SMTP）
□ 找回密码人工审批：前台提交 → 后台批准 → 收到临时密码邮件 → 首登强制改密 → 改密后恢复
□ 集合索引 /collections + 集合页 /collections/[slug]；旧链接 /products?category=x 307 迁移
□ 商品列表/详情/搜索/筛选/分页
□ 加购（游客）→ 登录合并；游客免登录四步结账 → 带 token 支付 → 订单 PAID
□ 多币种切换（汇率实时）；渠道×币种不匹配时首页结算渠道置灰
□ 结算 → Stripe Checkout → Webhook 改状态
□ 订单详情页发票 PDF 下载（中文字体）
□ 申请退款 → 管理端审核 → 退款成功邮件
□ 账户注销申请 → 后台处理（驳回恢复 / 确认注销→匿名化+旧会话失效+旧邮箱登录失败）
□ 管理端：建 SKU / 上下架 / 改库存 / 批量删除 / 上传按用途归档 / 看审计日志
□ 后台「找回密码」批准弹窗一次性回显临时密码（DB 无明文、刷新不可再取）
□ 联系表单留言落库 + contactEmail 收到通知
□ 分销：`?ref=` 链接注册 → 推荐人自动成为分销商 → 新客下单支付 → 后台佣金流水出现三层 10/5/2
□ 分销：复购（不带链接）仍归原分销商；已绑定客户点别人链接不被抢绑
□ 分销：确认收货后佣金转可提现；该订单退款后佣金冲正并从余额扣回
□ 分销：顶栏 Account 点进来的 `/account` 页**直接就能看到**分享小卡片（左侧导航**不应**出现分销主入口）
□ 分销：成功推广后卡片出现「进入分销中心」，**新标签页**打开 `/distribution`，外观与商城一致（同款页头页脚）
□ 分销：「我的客户」手机号显示 138****1234（服务端脱敏，非前端打码）
□ 分销：提现申请 → 审核通过 → 线下打款标记（冻结核销）/ 驳回（解冻退回）
□ 分销：`DISTRIBUTION_ENABLED=false` 时个人中心与后台入口消失、`/api/distribution/*` 返回 404
□ GDPR Cookie 横幅出现、接受后消失、页脚 Cookie Consent 可重新唤起
□ 移动端 375px / iPad 768px / 桌面 1440px
□ 中文 + English 双语切换不丢字（含 /zh 前缀路由）
□ 关闭 Redis 启动 → 有降级日志不崩溃
```

## 十二、回滚预案

- Docker 镜像打 `git sha` 标签，保留最近 10 个
- DB 迁移只前滚不后滚；失败立即从备份恢复
- Stripe 密钥泄漏：立刻在 Stripe Dashboard roll key，重启换环境变量

## 十三、CI/CD（已有）

`.github/workflows/ci.yml` 门禁包括：`lint-typecheck`、`audit`（npm audit high/critical）、
`migration-gate`（完全空库 `migrate deploy` + `migrate status` + 迁移/schema 漂移）、
`test`、`build`、`e2e`，最后由 `docker-smoke` 构建**最终生产镜像**、在隔离服务上启动，
自动执行 `migrate deploy` 并验证 `/api/healthz` 与 `/healthz`。任一门禁失败都不得发布。

> CI build/start smoke 不是镜像发布流水线；生产发布仍须扫描镜像、生成不可变 digest、签名并推送到受控仓库。

---

**判定规则**：上述检查清单 100% 全绿，才允许把生产密钥写进环境。任何一项不绿，只能跑演示/内测。

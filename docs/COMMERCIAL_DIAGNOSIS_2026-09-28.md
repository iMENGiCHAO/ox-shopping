# 商业交付诊断报告（2026-09-28）

> **诊断对象**：Ox Shopping（Next.js 16 App Router + Prisma 5.22 + PostgreSQL 16，多币种 / 分销 / 渠道化支付）
> **诊断方法**：八维度并行深查（资金链路 / 订单库存履约 / 用户认证权限 / 运营后台 / 前台体验 / 安全 / 性能可观测 / 运维部署）+ 梦哥自查（环境变量、迁移状态、商业数据不变量 SQL 实测、空库迁移实测、生产依赖审计）
> **诊断基线**：41 个 migration、36 张表、tsc 0 错、lint 0 error、单测 284、集成 172、生产依赖 0 漏洞
> **判定口径**：对照 [CURRENT_CAPABILITY_MATRIX.md](./CURRENT_CAPABILITY_MATRIX.md) 的 10 条生产发布门禁

---

## 一、交付判定

| 维度 | 判定 | 说明 |
|---|---|---|
| **代码资金正确性** | ✅ **达标**（本轮修复后） | 3 个资金 P0 已修（未到账即发货 / 重复支付不可退 / 迟到退款无幂等） |
| **数据一致性** | ✅ **达标** | 7 项商业不变量 SQL 实测 0 违规；金额恒等式落库级成立 |
| **安全基线** | ✅ **达标**（本轮修复后） | 鉴权 105/105 覆盖；2 个高危已修（JWT 用途混淆 / 未验证邮箱下单） |
| **部署可执行性** | ✅ **达标**（本轮修复后） | P0 部署阻断已修（Dockerfile 引用已删脚本） |
| **业务上线前置** | ⚠️ **待业务侧完成** | 支付渠道商户账号、邮件服务、域名 TLS、备份异地、法务签署 |
| **运营成熟度** | ⚠️ **有明确待办** | 集合维护入口、订单导出丢列、邮件失败不可见等（见第四节） |

**结论**：**代码层面达到可交付状态**；上线前必须完成业务侧准备（第五节），
并建议按第四节清单迭代运营功能（不阻断收款与履约）。

---

## 二、本轮修复（P0 / 高危，全部已验证）

### 2.1 资金安全（3 项，最严重）

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| F1 | **Stripe 通用回调缺 `payment_status` 校验** | 异步支付方式（SEPA/Boleto/OXXO/Klarna）在客户提交收银台瞬间即发 completed（未到账）→ 订单置 PAID 并发货 = **凭一张凭证白拿货** | `providers/stripe.ts` 与 webhook 同口径校验；未到账返回 `skipReason`，调用方回 success 但不认账，等待 `async_payment_succeeded` 事件驱动 |
| F2 | **同一订单可并发生成多个 Checkout Session** | 两个标签页各付一次 → 第二笔在系统内**无法退**（退款封顶 order.total） | 路由层补固定幂等键 `late-paid-{orderNumber}`；`markOrderPaid` 检测「已 PAID 却收到不同交易号」→ 自动退款 + 告警（见 2.2 的二次支付检测） |
| F3 | **迟到支付退款无幂等键**（渠道有、Stripe 无） | 同一取消单收到不同 event.id 的 completed → 重复发起退款 | Stripe 路径补 `late-paid-{orderNumber}` 幂等键 |

### 2.2 订单 / 库存

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| O1 | **下单幂等键未接线** | schema/service/前端都接了，`POST /api/orders` 逐字段转调**漏传** → `idempotencyKey` 恒 NULL、唯一索引形同虚设，双击仍是两张单各扣一份库存 | 路由补传 `input.idempotencyKey` |
| O2 | 退款申请占用聚合漏 `PENDING` | 用户看到「可退额度」大于实际可批准额度，提出永远批不过的申请 | 占用集合对齐五状态 |
| O3 | 后台 tracking 接口返回未序列化对象 | 游客单 `accessToken`（查单凭据）随响应发给 staff | 统一走 `serializeOrder` |

### 2.3 安全（2 个高危）

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| S1 | **JWT 跨用途混用** | 邮箱验证 token 与 access token 同密钥、access 侧不校验用途 → 任何拿到验证邮件链接的人获得 **24 小时**会话，且 logout / 吊销全部会话**杀不掉**（它不在 refreshToken 表） | `signAccessToken` 写 `purpose:"access"` + `verifyAccessToken` 强制比对（与其他用途 token 彻底隔离） |
| S2 | **未验证邮箱可下单** | 订单确认/发货/退款邮件寄到不存在或他人信箱，客诉与坏账无法处理 | 下单前门控 `emailVerified`，403 并引导重新发送验证邮件 |
| S3 | 后台页面级越权 | `adminOnly` 只是**客户端菜单过滤**，SUPPORT 直连 `/admin/launch-readiness` 可读邮件发件人/S3/Redis/未改密种子管理员邮箱 | 页面顶部加 `requireAdmin()`（launch-readiness + shipping） |
| S4 | 口令复核零限流 | 改密 / 换邮箱的 `currentPassword` 校验可无限在线爆破（实测 13 次无 429）→ 猜中即账号接管 | 新增 `passwordVerify` 策略（5 次/15 分钟，按用户）并接线两处 |
| S5 | PII 进日志 | 收件人邮箱明文落日志，且 logger 无 redact 兜底 | mail 层脱敏 + pino `redact` 白名单兜底 |

### 2.4 部署（P0 阻断）

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| D1 | **Dockerfile 入口引用已删除脚本** `scripts/wait-for-db.mjs`（3a1ff5f 删除时未同步 Dockerfile） | `&&` 链首段失败 → **docker compose 生产与演示两条路径全部起不来**，CI docker-smoke 必红 | 去掉外部等待脚本（compose 已用 `depends_on: service_healthy`），迁移失败即退出由 restart 策略重试；注释记录根因 |
| D2 | 空分类页 / 首页 / 集合索引 **零空态** | 0 商品时页面只剩标题 + 空白，看起来像坏了 | 三处补空态文案（双语） |
| D3 | 375px 搜索浮层双栏溢出、筛选抽屉 400px 宽于视口 | 移动端面板被裁 + 横向溢出 | 搜索浮层小屏单栏、抽屉 `min(400px,100vw)` |

---

## 三、诊断确认的健康项（可作为交付信心依据）

### 3.1 实测数据不变量（本机生产结构库）

| 检查项 | 结果 |
|---|---|
| 金额恒等式 `total = subtotal + shipping + tax − discount` 破损订单 | **0** |
| 商品库存负数 | **0** |
| 已支付状态但 `paidAt` 为空 | **0** |
| CANCELLED 却有 `paidAt` | **0** |
| 孤儿订单项（指向不存在订单） | **0** |
| 退款累计超额订单 | **0** |
| **空库全量迁移**（41 migrations → 36 表） | ✅ 通过 |
| `prisma migrate status`（生产结构库） | ✅ up to date，零漂移 |
| `npm audit --omit=dev`（487 生产包） | ✅ 0 漏洞 |
| 健康检查 `/api/healthz`（livez）+ `/healthz`（readyz，含 DB `SELECT 1` + 2s 超时） | ✅ 200 |

### 3.2 审计确认健壮的模块

- **鉴权覆盖**：`/api/admin/**` 75 个 route、105 个 handler **100%** 有 `requireStaff/requireAdmin`；19 个零鉴权端点逐条判定均为设计公开读或验签豁免
- **注入与转义**：26 处 raw SQL 全参数化（`$queryRawUnsafe` 0 命中）；9 处 `dangerouslySetInnerHTML` 全安全（JSON-LD 走 `safeJsonLd`，邮件模板用户输入只走 React 文本节点）
- **上传安全**：MIME 白名单 + sharp magic 解码 + 双层大小校验 + 随机文件名 + 路径穿越防护 + 存储不在 `public/`
- **越权防线**：订单统一 `requireOrderAccess`（游客 token 常量时间比较）；地址/购物车/通知/分销全部 `where {id, userId}`；分销 11 个端点无一处读外部 distributorId
- **CSRF/安全头**：全部变更方法 double-submit 强制 + 生产 CSP nonce + `strict-dynamic`（无 `unsafe-inline`）+ HSTS/XFO/nosniff
- **密钥与凭据**：无 `NEXT_PUBLIC_` 泄露；支付渠道 config AES-256-GCM（随机 IV + AEAD）；生产弱密钥 / mock 支付 / 无密码 Redis / S3 缺项**均 fail-fast 拒绝启动**
- **会话**：refresh 单次消费 + 重放检测 + 跨实例原子 claim；密码 bcrypt 12 轮（生产 <10 拒绝启动）
- **多实例安全**：调度器租约表选主（`INSERT ON CONFLICT ... WHERE lockedUntil < now()`），任务在租约事务外执行
- **备份脚本质量**：`pg_dump` 自定义格式 + SHA-256 + 原子发布 + `umask 077`；恢复强制 `RESTORE_CONFIRM` + 校验文件 + 单事务

---

## 四、待办清单（不阻断收款与履约，按优先级）

### P1（运营与合规，建议上线后首批）

| # | 项 | 影响 |
|---|---|---|
| 1 | **迟到支付兜底的第三条路径**：`markOrderPaid` 在 `paymentSessionId` 为 NULL 时静默返回（不收钱也不退款不告警）—— 修法：非 PENDING_PAYMENT 且收到真实交易号时无条件走退款 + 落 Refund/PaymentLog + 告警 | 低概率但静默吞钱 |
| 2 | **预售同商品多行**：`stockDeducted` 用同一份 stock 快照逐行计算 → 记录超实际扣减，取消时凭空造库存 | 库存虚增 |
| 3 | **COD 已发货/已送达单退款**：被无资金动作判为「已退款」并立即回补库存 | 账实不符 |
| 4 | 管理员重置用户密码**不发通知**；找回密码批准时邮件失败仍改密（用户锁死） | 直接伤客户 |
| 5 | 改价/改库存/角色变更**只记动作不记前后值**；佣金/提现导出（含实名 PII）**无审计** | 合规红线 |
| 6 | MailOutbox `FAILED` 后台**完全不可见**（无列表/重投/计数）；提现申请无管理员通知 | 运维黑洞 |
| 7 | 商品↔集合归属（`product_collections`）**后台无入口**，只能改库；`Product.descriptionEn` 无写入路径 | 功能缺口 |
| 8 | 订单导出**丢商品明细** + 5000 行静默截断 + `presale` 筛选被吞 | 财务/仓库不可用 |
| 9 | 缓存失效：下单/取消/退款改库存后**不失效商品列表缓存** → 售罄后最长 60s 仍显示可买（与 PDP 矛盾） | 体验/投诉 |
| 10 | 慢查询：仪表盘每次 miss 13 条 SQL（2 条无界全表聚合 + `order.count()`）；分类树全量商品入内存；用户详情无 take 拉全量订单 | 生产量级后变慢 |
| 11 | 无 `/metrics`：订单数/支付成功率/outbox 积压/cron 心跳不可观测；`scheduler_lease` 只写不读 | 运维盲区 |
| 12 | 5xx 上报缺 `requestId`/`userId`（Sentry 无法串联）；`SENTRY_DSN` 默认空且上线自检不校验 | 排障困难 |
| 13 | 无构建标识（`generateBuildId` / healthz 版本）；无镜像制品与推送（回滚无物可回，破坏性迁移使代码回滚不可行） | 发布/回滚 |
| 14 | 备份链路：自动备份落在命名卷，恢复脚本只吃宿主路径且**文档无取卷步骤**；无异地同步、无 PITR（RPO≤24h） | 灾备 |
| 15 | 分销 8 页 + 账户 5 页**零 metadata**；sitemap 漏收 9 个页脚公开页；`/orders` 双 h1 | SEO/体验 |
| 16 | `next` 16.3.3 → **16.3.6**（CVE-2026-94545 ImageResponse RCE；本项目未用该 API，暴露 0，但升级零代码成本） | 安全 |

### P2（体验与健壮性）

- 地址表单校验文案客户端英文（注释宣称已覆盖但未实现）；分销规则页英文界面露中文全角括号；账户资料页中文日期硬编码
- 8 处内容图片无破图兜底（顶栏 logo / 分类横幅 / 推广二维码最重）
- 到货提醒仪表盘数字与列表口径不一致；待发货数字无等价列表筛选；今日营收卡内两数字口径不同
- `pg_trgm` 缺失导致后台订单搜索 seq scan；`distribution_relations.depth` 无前导索引；`notify_me(productId,status,createdAt)` 缺复合索引
- N+1：到货提醒逐条 `update`、购物车合并 1+2N、日汇总按天循环 upsert
- 深分页 3 处 page 无上限；支付渠道缺 DELETE；`defaultLang` / 站级 `presaleNote` 有读无写
- 搜索/上传/订单子路由/地址 PUT·DELETE/user export 无限流；orderNumber 存在性枚举 oracle（404/401/403 三态）
- `/api/load` 类长事务、优雅退出无 `stop_grace_period`、调度器不参与 SIGTERM、租约 TTL 与可配心跳不匹配

---

## 五、上线前的业务侧前置（代码无关，须由运营/法务完成）

对照 `CURRENT_CAPABILITY_MATRIX.md` 的 10 条发布门禁：

1. **支付渠道**：Stripe 生产密钥 + webhook secret + 真实测试模式全链路验收；支付宝/微信/银行卡/PayPal 四家**预留渠道需商户账号**（当前诚实置灰，误启用不会假成功）
2. **邮件服务**：SMTP/Resend 生产凭据 + 送达验收（当前默认 `console`，仅落日志）
3. **对象存储**：S3/R2 bucket + 生命周期策略（本地磁盘模式仅单实例演示可用）
4. **域名与 TLS**：`SITE_URL` 指向生产域名（找回密码链接 / Stripe 回调 / 邮件链接 / sitemap 全依赖它）
5. **备份异地**：备份卷同步到与宿主隔离的对象存储 + 恢复演练（当前 `backups/` 为空，无演练证据）
6. **种子凭据**：删除或修改 `admin@example.com` 等演示账号（`SEED_DEMO_ACCOUNTS` 生产默认跳过，但仍须核对）
7. **法务**：隐私政策/条款/退款政策/分销合规（多级分销在部分司法辖区受限）/资产管理（演示图片须替换或取得授权）
8. **税务**：发票税号、费率与开票流程

---

## 六、验证证据（本轮）

```
tsc --noEmit                        → 0 error
eslint .                            → 0 error（14 警告，均为既有基线类）
vitest run tests/unit               → 284 passed
vitest run tests/integration        → 172 passed（21 文件）
npm run build                       → ✅（standalone）
npm audit --omit=dev                → 0 vulnerabilities
空库 migrate deploy（41 迁移）       → ✅ 36 表
生产结构库 prisma migrate status     → up to date / 零漂移
商业不变量 SQL（7 项）               → 全部 0 违规
/api/healthz + /healthz             → 200
```

**诊断执行**：八维度并行只读审计（资金 / 订单库存 / 用户权限 / 运营后台 / 前台体验 / 安全 / 性能可观测 / 运维部署）+ 主代理自查；全部结论带 `file:line` 证据，未验证项已逐条标注。

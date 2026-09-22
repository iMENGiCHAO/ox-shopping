# 分销 / 联盟返佣系统 · 商业交付级深度审查报告

> 审查对象：Ox Shopping 自建电商的**分销/联盟返佣模块**（Next.js 16 App Router + TS 严格模式 + Prisma/PostgreSQL + Redis + Stripe）
> 审查方式：**只读**通读源码 + 只读 SQL 核验线上库事实（未修改任何源码 / 配置 / 迁移）
> 审查日期：2026-09-21
> 结论一句话：**架构骨架（闭包表 + 幂等账本 + bridge 隔离）是够商用水准的；但"钱算得对不对、报表信不信得过、出了事兜不兜得住"这三件事上还有 3 个 P0 与 8 个 P1，现在放大额真实提现是不安全的。**

---

## 目录

- [一、审查范围、方法与本次核验到的事实](#一审查范围方法与本次核验到的事实)
- [二、结论摘要（一页版）](#二结论摘要一页版)
- [三、P0 发现（阻断交付，共 3 条）](#三p0-发现阻断交付共-3-条)
- [四、P1 发现（高，共 8 条）](#四p1-发现高共-8-条)
- [五、P2 发现（中，共 12 条）](#五p2-发现中共-12-条)
- [六、P3 发现（建议，共 8 条）](#六p3-发现建议共-8-条)
- [七、八大商业维度逐项结论](#七八大商业维度逐项结论)
- [八、本次审查确认"做对了"的部分（改之前先读）](#八本次审查确认做对了的部分改之前先读)
- [九、距离"顶级商用分销"还缺什么（功能清单 + 优先级路线图）](#九距离顶级商用分销还缺什么功能清单--优先级路线图)
- [十、附录：核验方法与"需确认"清单](#十附录核验方法与需确认清单)

---

## 一、审查范围、方法与本次核验到的事实

### 1.1 覆盖范围（全部为实际读过的文件）

| 层 | 文件 |
| --- | --- |
| 数据模型 | `prisma/schema.prisma`（`DistributionRelation` / `DistributorCustomerBind` / `DistributionDailyStat` / `RebindRequest` / `CommissionRule` / `CommissionLog` / `DistributorAccount` / `WithdrawRecord` / `OrderAttribution`，L773–1031）、`CommissionStatus` / `WithdrawStatus` 枚举 |
| 领域服务 | `src/server/services/distribution/{bridge,bind,commission,rule 相关 config,relation,account,report,notify,config,http,index,format-server}.ts`（12 个文件，约 4 000 行） |
| 纯逻辑层 | `src/lib/distribution/{contract,rules,referral,mask}.ts` |
| 分销员 API | `src/app/api/distribution/**`（13 个 route） |
| 管理端 API | `src/app/api/admin/distribution/**`（22 个 route） |
| 分销员前台 | `src/app/(distribution)/distribution/**`（dashboard/commissions/customers/orders/rules/subordinates/team/withdrawals + layout） |
| 管理端页面 | `src/app/admin/distribution/**`（11 个页面） |
| 订单/退款/支付挂接 | `src/server/services/order.service.ts`（hook 调用点）、`src/app/api/admin/refunds/[id]/route.ts`、`src/app/api/orders/route.ts`、`src/app/api/webhooks/stripe/route.ts`、`src/app/api/pay/notify/[channelCode]/route.ts` |
| 归因入口 | `src/proxy.ts:114-126, 258-268`（cookie 签名写入）、`src/lib/distribution/referral.ts` |
| 定时任务 | `src/server/jobs/scheduler.ts`、`src/server/jobs/start.ts`、`bridge.runReconcile/runRollup` |
| 通知/邮件 | `src/server/services/distribution/notify.service.ts`、`src/emails/templates.tsx#DistributionNoticeEmail`、`src/lib/mail/index.ts` |
| 校验/权限 | `src/lib/validations/distribution.ts`、`src/lib/auth/session.ts#requireAdmin/requireStaff` |
| 测试 | `tests/integration/distribution.test.ts`（1 208 行 / 30 个用例）、`tests/unit/distribution.test.ts`（560 行） |

### 1.2 本次核验到的环境事实（**任务书中的两项假设在此被证伪 / 修正**）

| 假设 | 实际核验结果 | 证据 |
| --- | --- | --- |
| "分销表疑似只用了 `prisma db push`，`prisma/migrations/` 里没有对应迁移，生产 `migrate deploy` 会缺表" | **证伪**。迁移齐全：`20260920185628_distribution_module` 建 8 张表 + 全部索引 + 外键，后续 7 个迁移补齐列/表（hardening / fixed_mode / terms / rebind / tier / daily_stats / partial index）。本地库 `npx prisma migrate status` 输出 **"27 migrations found … Database schema is up to date!"** | `prisma/migrations/20260920*`–`20260921140000_*`；`npx prisma migrate status` 实测 |
| "提现的 DB 级唯一约束可能不存在" | **不存在问题**。部分唯一索引已在库中生效：`"withdraw_records_one_inflight_per_user" UNIQUE, btree ("userId") WHERE status = ANY (ARRAY['PENDING','APPROVED'])` | `psql \d withdraw_records` 实测；`prisma/migrations/20260921120000_withdraw_one_inflight_per_user/migration.sql` |
| （新发现）迁移基线是**事后手写**的，开发库曾用 `db push` 建分销表 | **属实，属遗留运维风险**：迁移文件自己写了"开发库存在 db push 建的分销表 drift，`migrate dev` 会要求 reset，故用 `migrate deploy` 应用" | `prisma/migrations/20260921130000_cod_fee/migration.sql` 注释 |

> 结论：**"缺表"不成立**，但"历史 drift"成立 → 见 [P2-9](#p2-9-迁移基线为事后手写存在-db-push-drift-的部署风险)。

### 1.3 本次用于实证的数据（只读 SQL）

本地库存在真实业务数据（`orders=96, order_attributions=80, commission_logs=62, distribution_daily_stats=122, withdraw_records=18, distributor_customer_binds=77`），
其中 **87 / 96 张订单含运费**、10 张含折扣、0 张含税，CNY 汇率快照 `fx.rates.CNY = 6.704712`。
这组数据让下面几条"报表口径错误"从"理论推断"升级为"实测偏差"。

---

## 二、结论摘要（一页版）

| 维度 | 评级 | 一句话 |
| --- | --- | --- |
| 归因与绑定 | **良（有 2 个死角）** | 首触定终身 + 唯一约束防抢绑做得对；但**绑定失效/上级被禁用后客户被永久锁死**，**换绑审批流可被并发绕过** |
| 佣金计算 | **中** | 基数口径（不含运费/税）与幂等键正确；但**等级规则的唯一键设计会让通用规则被覆盖、非该等级佣金静默归零**（P0），**冲正分母用 `order.total` 与计佣基数不一致**（P1） |
| 结算与提现 | **中** | 原子扣减 + 事务化 + 部分唯一索引 + 日/月额度，工程上很扎实；但**无个税代扣/净额字段**（P0）、**无经销商级冻结**、**无手续费** |
| 对账/补偿 | **良（有饥饿缺陷）** | 四类补偿 + 账户一致性修复 + 可手动触发，思路正确；但**补偿查询会饥饿**、**报表把冲正当支出**、**日汇总币种折算错 6.7 倍** |
| 并发与一致性 | **良** | CAS 认领、部分唯一索引、行锁退款，都有；但**结算/冲正的"流水推进"与"账户资金动作"不在同一事务** |
| 权限与安全 | **中** | 行级权限 + 服务端脱敏是亮点；但**角色只有 ADMIN 一档**、**反作弊只认 `fromUserId==toUserId`**、**拒付无处理**（P0） |
| 可运营性 | **中** | 后台 10 个视图 + CSV 导出 + 通知双通道；缺**告警通道、结算单/完税凭证、封禁/冻结动作、分销员自助导出** |
| 工程化 | **良** | 迁移齐全、1 700+ 行测试、类型安全、bridge 隔离；缺**导出审计、单测未覆盖本次发现的口径 bug** |

**P0 = 3 条，P1 = 8 条，P2 = 12 条，P3 = 8 条。**

---

## 三、P0 发现（阻断交付，共 3 条）

### P0-1 等级差异化佣金规则会**覆盖通用规则**，并让"非该等级"的分销商在该层级**佣金静默归零**

- **现象**
  1. `CommissionRule` 的唯一键是 `@@unique([scopeType, scopeId, level])` —— **不包含 `tierLevel`**。
  2. 因此同一 `(GLOBAL, "", level)` 上**只能存在一行**；后台"限定分销商等级（留空=通用）"保存走的是 `upsert(where: {scopeType_scopeId_level})`，
     于是运营一旦为 VIP 2 级配置"二级 20%"，**通用二级规则（默认 5%）被同一行覆盖**：`tierLevel` 变成 2、`ratio` 变成 20。
  3. `resolveRule()` 的等级挑选逻辑是"先找 `tierLevel === 本人等级`，找不到再找 `tierLevel` 为空或 0 的通用规则"。
     当该层级只剩 `tierLevel=2` 这一行时，**tier=0/1 的分销商解析结果为 `null` → `planCommissions` 直接 `continue` → 该层级一分钱都不返**，而且日志、页面、接口全部正常。
- **代码位置**
  - `prisma/schema.prisma:901` → `@@unique([scopeType, scopeId, level])`（缺 `tierLevel`）
  - `src/app/api/admin/distribution/rules/route.ts:59-84` → 以 `scopeType_scopeId_level` 为键 `upsert`，`update` 里改写 `tierLevel`
  - `src/lib/distribution/rules.ts:74-78` → `tierSpecific ?? inScope.find(r => !r.tierLevel || r.tierLevel === 0)`；L80 `pick(...)` 返回 `undefined` 时 L81 `return null`
  - `src/app/admin/distribution/rules/page.tsx:913-918` → 后台**确实存在**"限定分销商等级（留空=通用）"输入框（即可被运营正常触达）
  - 默认规则已播种 level 1–5（`src/lib/distribution/contract.ts:143-149`），所以 **level 2 一定已存在通用行**，撞键是必然而不是偶然
- **为什么是问题**
  这是"**功能已发布、后果静默、只在分销商投诉时才发现**"的典型资金缺陷：
  ① 后台 UI 明确邀请运营配置等级规则；② 一旦配置，**除该等级外的所有人都少拿该层级佣金**（不是少一点，是归零）；
  ③ 现有集成测试恰好只验证了"VIP 命中 20%"，**没有验证"普通等级在同一层级仍拿到通用比例"**，所以测试全绿也发现不了
  （`tests/integration/distribution.test.ts:1107-1164`，测试自己用的就是 `upsert` 撞键的写法，并在 finally 里把通用规则改回去）。
- **建议怎么改（表结构 + 函数级）**
  1. **表结构**：把 `tierLevel` 纳入唯一键且改成非空默认 0（0 = 通用），避免 PG 里 `NULL` 互不相等导致唯一约束失效：
     ```prisma
     model CommissionRule {
       tierLevel Int @default(0)   // 0 = 通用（原 null 语义）
       @@unique([scopeType, scopeId, level, tierLevel])
     }
     ```
     新迁移需把现有 `tierLevel IS NULL` 的行 `UPDATE ... SET "tierLevel" = 0`，并重建唯一索引。
  2. **`resolveRule()`（`src/lib/distribution/rules.ts:55-92`）**：改为按 `tier` 精确匹配优先、`tierLevel=0` 兜底，且**同一 `(scope, level)` 允许通用行与等级行并存**：
     ```ts
     const byTier = inScope.find((r) => r.tierLevel === tier) ?? inScope.find((r) => r.tierLevel === 0);
     ```
  3. **后台 upsert（`rules/route.ts:59-62`）**：`where` 改成四元组 `scopeType_scopeId_level_tierLevel`，并在保存时**校验"若新增等级行，通用行必须存在"**（否则弹警告："该层级将只对 VIP N 生效，其他等级为 0%"）。
  4. **回归测试**：在 `tests/integration/distribution.test.ts` 的 P2-15 用例里补断言 —— `tier=0` 的分销商在同一订单该层级拿到**通用比例（5%）**而不是 0。

---

### P0-2 提现**无个税代扣、无净额字段**：按毛额打款 = 平台承担扣缴义务风险

- **现象**
  `WithdrawRecord` 只有 `amount`（毛额），没有 `taxAmount` / `netAmount` / `feeAmount` / `taxVoucherNo` / `taxRate`；
  `auditWithdraw()` 的 `paid` 分支只核销 `frozen`，打款金额 = `amount`；
  后台提现页只展示"金额 + 收款人实名 + 打款备注"，**没有任何"实付金额 / 已扣税"概念**。
- **代码位置**
  - `prisma/schema.prisma:978-1011`（`WithdrawRecord` 全字段，无税/费/净额）
  - `src/server/services/distribution/account.service.ts:378-397`（`paid` 分支：仅 `frozen: { decrement: amount }`）
  - `src/server/services/distribution/account.service.ts:1078-1092`（`exportWithdrawRows` 导出字段：金额=毛额，无税）
  - 全仓检索 `taxAmount|netAmount|feeAmount|withheld` → **0 命中**；检索 `dispute|chargeback` → **0 命中**
- **为什么是问题**
  国内个人推广佣金属"劳务报酬"，平台是法定扣缴义务人。按毛额打款且账上无任何代扣痕迹，等于把这些风险留给平台：
  ① 补税 + 滞纳金 + 罚款；② 无法向分销商出具完税凭证；③ 财务口径上"佣金的税前支出"与"实际资金流出"不可区分，
  对账时无法解释"为什么结算了 10 000 元、银行只走了 8 000 元"。
- **建议怎么改（表结构 + 函数级）**
  1. `WithdrawRecord` 增字段：`grossAmount`（毛额，保留 `amount` 兼容）、`taxAmount`、`netAmount`、`taxRate`、`taxVoucherNo`。
  2. `DistributionConfig`（`src/lib/distribution/contract.ts:95-140`）增 `withholdingPolicy`：
     `{ thresholdFree: 800, rate: 0.2 }` 之类，并写进 `coerce()`（`src/server/services/distribution/config.service.ts:45-95`）。
  3. `applyWithdraw()`（`account.service.ts:224`）在扣余额时按策略算出 `gross/tax/net` 落库，提现单上**余额按毛额扣**（钱本来就是他的），
     `paid` 时只打 `netAmount`，并强制填写 `taxVoucherNo`。
  4. 后台提现页（`src/app/admin/distribution/withdrawals/page.tsx`）与导出（`exportWithdrawRows`）增加"毛额 / 代扣个税 / 实付"三列；
     分销员前台（`src/app/(distribution)/distribution/withdrawals/page.tsx`）同步展示"实付"。
  5. 月度结算单（见 [P2-8](#p2-8-无结算单--完税凭证分销员前台无任何自助导出)）以 `netAmount` 汇总，作为完税凭证载体。

---

### P0-3 没有拒付 / 争议（chargeback）处理 → **平台在自己已经丢钱的订单上照付佣金**

- **现象**
  全仓 `dispute` / `chargeback` 零命中。佣金冲正只有两条触发路径：**订单退款**（`onOrderRefunded`）与**整单取消**。
  拒付发生时钱被网关扣回平台，但订单状态通常仍是 `PAID/PROCESSING/SHIPPED/DELIVERED`，
  于是 `settleDueOrders()`（支付满 `settleHoldDays`，默认 15 天）**照常把佣金结算进可提现余额**，
  分销商提现后平台才发现"这笔钱其实没收到"。
- **代码位置**
  - `src/server/services/order.service.ts:951`（`onOrderPaid`）、`:1233`（`onOrderDelivered`）、`:1499` / `:1616`（`onOrderRefunded`）—— 四个钩子**没有争议事件**
  - `src/server/services/distribution/commission.service.ts:292-308`（`reversalRatioForOrder` 只看 `order.status` 与 `refund` 表）
  - `src/app/api/webhooks/stripe/route.ts`（只处理 `checkout.session.completed` / `charge.refunded` 一类事件）
  - `src/server/services/distribution/commission.service.ts:443-465`（`settleDueOrders` 不含任何争议/风控排除条件）
- **为什么是问题**
  这是**直接的资金损失**，且不是小概率：跨境卡支付的拒付率在 0.5%–1.5% 量级，分销佣金比例 10%–30%，
  意味着**拒付造成的损失会被佣金再放大一次**。此外争议有"举证期"，期间佣金不该进入可提现余额。
- **建议怎么改（具体到函数）**
  1. Stripe webhook（`src/app/api/webhooks/stripe/route.ts`）增加 `charge.dispute.created` / `charge.dispute.closed`：
     - `created` → 把对应订单加入"争议中"集合（新增 `order_disputes` 表或 `Order.disputedAt` 字段），
       并调用 `distributionBridge.onOrderRefunded(orderId)` 复用现成的 `syncOrderReversal()` 做**全额冲正**（增量 + CAS，幂等）。
     - `closed` 且 `status = won` → 再决定是否回滚（建议默认不回滚，人工审核后手动冲回，避免"赢了官司钱又跑掉"）。
  2. `settleOrder()`（`commission.service.ts:200`）与 `settleDueOrders()`（`:443`）在入账前增加一道闸门：
     `order.disputedAt != null` 或 `commissionLog.status = FROZEN` → 跳过结算。
  3. `CommissionStatus` 枚举增加 `FROZEN`（见 [P2-10](#p2-10-佣金状态机只有-three-states无独立冻结--风控挂起态)），让"风控挂起"成为一等状态而不是靠 note 备注。

---

## 四、P1 发现（高，共 8 条）

### P1-1 冲正分母用 `order.total`，计佣基数用 `subtotal − discount` → **系统性多冲/少冲**

- **现象**
  - 计佣基数：`subtotal − discount`（**不含运费与税**）。
  - 冲正比例：`Σ已完成退款金额 / order.total`（**分母含运费与税**）。
  两边口径不同源。当"商品全退、运费不退"时（退款额 = 商品实付），比例为 `(subtotal−discount)/total < 1`，
  于是**佣金只被冲掉一部分，分销商在已被全额退款的商品上继续保留佣金**；反之"只退运费"也会触发一次不该有的冲正。
- **代码位置**
  - `src/server/services/distribution/commission.service.ts:69-71`（`commissionBase = subtotal − discount`）
  - `src/server/services/distribution/commission.service.ts:292-308`（`reversalRatioForOrder`，L305 `const total = Number(order.total) || 0`）
  - `src/server/services/distribution/commission.service.ts:348-352`（`targetAmount = round2(amount * ratio)` —— 把上述比例直接乘到佣金上）
- **为什么是问题**
  这不是边界情况而是**主路径**：本地库实测 **87 / 96 张订单含运费**。偏差 = 运费占订单额的比例，
  跨境小包运费常占 10%–25% → 相当于**每笔全额退款都漏冲 10%–25% 的佣金**，且长期累积无人察觉。
  注意它还有一个副产品：`refund` 的上限校验用的是 `order.total`（含运费），
  所以"退满 total"这一条路径下比例确实能到 1，会掩盖前面的漏洞，让问题更难在生产上暴露。
- **建议怎么改**
  1. 冲正应当**以"被退款商品对应的计佣基数"为分子、以原计佣基数为分母**，而不是用整单金额。
     最小改动：`reversalRatioForOrder()` 改成
     `refundRatio = Σ(refund.amount) / commissionBaseTotal`，再 `Math.min(1, ratio)`
     （`commissionBaseTotal = subtotal − discount`；`Refund` 表若无法区分运费/商品，则**约定退款单只针对商品金额**并在退款申请接口限制 `amount ≤ subtotal − discount`）。
  2. 更彻底的方案（推荐给顶级商用）：`Refund` 表增加 `refundScope`（`GOODS | SHIPPING | MIXED`）与 `goodsAmount`，
     冲正按 `goodsAmount / (subtotal − discount)` 计算；运费退款不参与冲正。
  3. 补测试：在 `tests/integration/distribution.test.ts:521` 的部分退款用例中，**构造一张 `shippingFee > 0` 的订单**，
     断言"商品全退 → 佣金全额冲正"。当前用例用的是 `half = total/2`，恰好绕过了这个缺陷。

### P1-2 团队业绩日汇总把销售额按 `total × exchangeRate` 折算 → **实测偏差 6.7 倍**

- **现象**
  `rollupDistributionDailyStats()` 注释写"销售额按订单汇率快照折算成 CNY"，但代码是
  `row.salesCny += Number(a.order.total) * rate`，其中 `rate = order.exchangeRate`。
  而 `order.exchangeRate` 的语义是"**1 USD 兑订单币种的汇率**"（`order.service.ts:386` + schema 注释 `schema.prisma:21`），
  正确公式应为 `total / exchangeRate * usdToCny`（即 `commission.service.ts:46-55` 的 `toCny()`）。
- **实测证据（本地真实数据，只读 SQL）**

  | 订单 | 币种 | total | exchangeRate | 汇总表写入 `salesCny` | 正确值 |
  | --- | --- | --- | --- | --- | --- |
  | `cmtsohsh5...` | CNY | 402.28 | 6.704712 | **2 697.17** | 402.28 |
  | 多笔 | USD | 45.00 | 1.0 | **45.00** | 301.71 (45 × 6.704712) |

  → **CNY 订单虚增 6.7 倍，USD 订单缩水 6.7 倍**，方向还相反。
- **代码位置**
  - `src/server/services/distribution/report.service.ts:1156-1160`（`const rate = Number(a.order.exchangeRate ?? 1) || 1; … Number(a.order.total) * rate`）
  - 对照正确实现：`src/server/services/distribution/commission.service.ts:46-55`（`toCny`）、`src/server/services/distribution/report.service.ts:135`（实时口径用了 `toCny`）
  - 汇总读侧：`src/server/services/distribution/report.service.ts:1213-1228` → `getTeamStats()` → `/api/distribution/my/stats` → `src/app/(distribution)/distribution/team/page.tsx:81`（"Team sales" 直接展示 `totalSalesCny`）
- **为什么是问题**
  分销员看到的"团队销售额"是**谈判/结算的依据**，也是平台衡量 ROI 的依据。错 6.7 倍且方向随币种翻转，
  任何一次商务对账都会当场翻车。更糟的是：**汇总表被页面优先读取**，一旦有汇总行就再也不回落实时口径，
  所以错误值会稳定呈现，而唯一的测试只断言了 `salesCny > 0`（`tests/integration/distribution.test.ts:1190`），永远抓不到。
- **建议怎么改**
  1. 把 `report.service.ts:1154-1161` 的折算改为复用 `toCny(Number(a.order.total), currency, Number(a.order.exchangeRate), usdToCny)`，
     并在查询里补 `currency: true`；`usdToCny` 用 `currentUsdToCny()`（与实时口径同源，保证"报表和明细对得上"这一承诺成立）。
  2. 单测/集成测试补断言：造一张 **CNY** 订单与一张 **USD** 订单，断言汇总 `salesCny` 分别等于 `total` 与 `total × usdToCny`。
  3. 历史数据修复：`POST /api/admin/distribution/rollup` 已经是幂等重跑入口，修完代码重跑即可回填近 3 天；更早的数据需一次性重算脚本。

### P1-3 "日汇总"与"实时聚合"的**统计语义不同源** → 同一张"团队业绩"卡片会给出两个不同的数字

- **现象**

  | | 统计对象 | 代码 |
  | --- | --- | --- |
  | 汇总路径（优先） | 只统计 `order_attributions.distributorId = 本人`（**直属归属**） | `report.service.ts:1127-1140`，按 `a.distributorId` 分桶 |
  | 实时路径（兜底） | 统计 `distributorId ∈ {本人 + 全部下级}`（**整团队**） | `report.service.ts:334-351`，`teamIds = [self, ...descendants]` |

  `getTeamStats()` 只要查到任意一行汇总数据就直接返回汇总口径（`report.service.ts:309-318`），
  于是**同一个分销商在有/无汇总数据时看到不同的"团队销售额"**，且汇总口径**漏掉整个下级团队的业绩**（与"团队业绩"这个标签直接矛盾）。
- **为什么是问题**
  这是"**报表不可信**"级别的缺陷：分销商的团队越大，两个口径差得越多；而页面标签叫"团队业绩"。
  同时它让 [P1-2](#p1-2-团队业绩日汇总把销售额按-total--exchangerate-折算--实测偏差-67-倍) 的修复变得必须一起做（否则修完折算还是错的）。
- **建议怎么改**
  1. 统一口径：汇总作业的 `sales` 分桶改为"**按下级展开**"——即对每个 `(ancestorId, descendantId)` 关系把订单业绩同时计入祖先；
     或更简单可靠：**汇总表只服务"本人直属业绩"**，而把"团队业绩"定为实时聚合 + 按日缓存的另一张表。
  2. 无论选哪种，都必须让 `getTeamStats()` 的 `source` 语义在 UI 上可见（当前 `source` 已返回但页面未展示），并在两条路径上写同一份口径测试。
  3. 建议加一条"对账断言"：同一 `(user, days)` 下 `|rollup − live| < 0.01`，作为集成测试的硬断言，防止未来再次漂移。

### P1-4 绑定失效（过期 / 上级被禁用）后**客户被永久锁死**，再也无法归属任何分销商

- **现象**
  两条查询用的是**不同的有效性定义**：
  - `getActiveBind()`：`status==='ACTIVE'` **且** `expireAt` 未过 **且** 上级 `status==='ACTIVE'`，否则返回 `null`（视为无绑定）。
  - `bindCustomer()`：只判断 `existing.status === "ACTIVE"`，**完全不看 `expireAt`，也不看原上级是否已被禁用**。

  于是：客户的上游绑定行仍是 `ACTIVE`，但上级**已被禁用**（`User.status = DISABLED`）或绑定**已过期**时，
  `getActiveBind()` 返回 `null` → 系统认为"可重新归属"，但 `bindCustomer()` 却立刻返回 `ALREADY_BOUND_OTHER` → **绑定永远无法发生**。
  订单落入 `natural=true`，分销商一分钱拿不到，且**没有任何页面/日志提示原因**。
- **代码位置**
  - `src/server/services/distribution/bind.service.ts:50-62`（`getActiveBind` 的三重有效性；L59 `expireAt`、L60 `distributor.status !== "ACTIVE"`）
  - `src/server/services/distribution/bind.service.ts:99-109`（`bindCustomer` 只看 `existing.status === "ACTIVE"` → 返回 `ALREADY_BOUND_OTHER`）
  - `src/server/services/distribution/bind.service.ts:325-341`（`attributeOrder` 因此拿到 `bind === null` → 走 `natural`）
- **为什么是问题**
  这是**永久性归因失效**：一旦某分销商因风控被禁用（`src/app/api/admin/users/[id]/route.ts:127-151` 提供该动作，且会 `revokeAllUserTokens`），
  他名下**所有存量客户**的归属全部失效且无法改绑 —— 客户正常下单，平台正常收款，
  但**佣金链条凭空断掉**，且只能靠管理员逐条 `releaseBind` 手工修复（`/api/admin/distribution/unbind`），运营根本不知道要去修。
  过期场景同理（`bindExpireDays > 0` 时）。
- **建议怎么改（函数级）**
  1. `bindCustomer()` 的"已绑定"判定**统一复用 `getActiveBind()`**，不要自己判断 `status`：
     ```ts
     const existing = await getActiveBind(input.customerId); // 已含 expireAt / 上级状态
     if (existing && existing.distributorId === distributor.id) return ALREADY_BOUND_SAME;
     if (existing && !config.allowRebind) return ALREADY_BOUND_OTHER;
     // existing === null → 走"重新绑定"分支（UPDATE 原行，保留 customerId 唯一键）
     ```
     注意：`getActiveBind` 返回 `null` 时，下面"从未绑定或曾解绑"的分支已经能正确 UPDATE 原行（`bind.service.ts:197-218`），所以改动很小。
  2. 客户被禁用/绑定过期时**主动释放**：在禁用用户的接口里（`admin/users/[id]/route.ts`）增加"释放其名下所有 ACTIVE 绑定 + 重建受影响子树闭包"的收尾动作，
     避免留下"挂死"的 ACTIVE 行。
  3. 增加运营可观测性：`getAdminOverview()`（`report.service.ts:412`）里加一个"**挂死绑定**"计数
     （`status=ACTIVE` 但上级不存在/被禁用/已过期），在后台总览页显红。
  4. 回归测试：`tests/integration/distribution.test.ts` 增加用例"上级被 DISABLED 后，客户用新码可成功改绑"。

### P1-5 管理员解绑（`releaseBind`）**不重建闭包** → 旧上级继续从整棵子树抽佣

- **现象**
  `releaseBind()` 只做两件事：把绑定行置 `RELEASED`、写审计。**它既不调用 `syncClosureFromBind()`，也不调用 `rebuildSubtreeClosure()`**。
  而佣金链的唯一数据源是 `distribution_relations` 闭包表（`getCommissionChain`）。
  于是如果被解绑的客户**本人也是分销商**，他名下整棵子树的闭包**仍然指向旧上级** →
  他的下级继续产生订单时，**旧上级照旧拿 10%/5%/2%**，平台在"关系已解除"之后继续付钱。
- **代码位置**
  - `src/server/services/distribution/bind.service.ts:380-405`（`releaseBind` 全文；L392-395 只有 `status: "RELEASED"`）
  - 对照正确做法：`bindCustomer()` 在绑定/换绑后会调 `rebuildSubtreeClosure()`（`bind.service.ts:166-183`、`:230-238`），
    说明作者知道"换绑必须重建子树"，**但解绑这条路径漏了**
  - `src/server/services/distribution/relation.service.ts:191-222`（`rebuildSubtreeClosure` 现成的）
  - 唯一调用方：`src/app/api/admin/distribution/unbind/route.ts:17`
- **为什么是问题**
  解绑是**风控处置动作**（刷单、纠纷、渠道违规）。它的语义是"从此这个人不再归你"，但系统实际执行的是"下一次下单归自然单"，
  对**他作为分销商的上级链**毫无影响 → 风控动作失效，且资金继续外流，属于"越管越漏"。
- **建议怎么改**
  1. `releaseBind()` 在事务里同时：
     ```ts
     await prisma.$transaction([...更新 RELEASED...]);
     await syncClosureFromBind(bind.customerId);            // 清掉他本人的上级链
     if (customer?.isDistributor) await rebuildSubtreeClosure(bind.customerId); // 重建整棵子树
     ```
  2. 同时清空/同步 `users.invitedById`、`distLevel`、`distPath`（`syncClosureFromBind` 已负责这三项）。
  3. 测试：`tests/integration/distribution.test.ts` 增加"解绑中间层分销商后，其下级的订单不再给旧上级分佣"。

### P1-6 没有"**分销商封禁 / 佣金冻结**"这个概念；禁用账号后**在途佣金照常结算入账**

- **现象**
  - 平台侧只有两个动作：**调等级**（`setDistributorTier`）与**禁用用户**（`admin/users/[id]`）。
    没有"冻结该分销商佣金 / 暂停结算 / 拉黑提现"的领域动作。
  - `User.status = DISABLED` 只影响**新的归因**（`getActiveBind` 会过滤），**不影响已产生的 PENDING 佣金**：
    `settleOrder()`（`commission.service.ts:200-237`）与 `settleDueOrders()`（`:443-465`）只看 `commission_logs.status` 与订单，**从不检查受益人状态**。
  - `applyWithdraw()`（`account.service.ts:224`）也**不检查用户状态**。
- **代码位置**
  - `src/server/services/distribution/commission.service.ts:200-237` / `:443-465`（结算路径无用户状态闸门）
  - `src/server/services/distribution/account.service.ts:224-345`（提现申请无用户状态校验）
  - `prisma/schema.prisma:956-974`（`DistributorAccount` 只有 `tier / termsAcceptedAt / balance / frozen / totalCommission`，无 `status` / `pausedAt` / `riskFlags`）
  - 唯一相关动作：`src/app/api/admin/users/[id]/route.ts:127-151`
- **为什么是问题**
  风控处置的**真实诉求是"先止付"**，而当前实现是"止归因、不止付"：
  一个正在刷单的分销商被禁用后，他之前刷出的佣金仍会在 15 天后自动进余额；
  由于账号被禁用无法登录提现，钱会**永久挂在账上**（既不能结算给平台，也不会退回），
  对账时表现为"应付佣金长期挂账"，没有业务动作能清理它。
- **建议怎么改**
  1. `DistributorAccount` 增 `status`（`ACTIVE | SUSPENDED | BANNED`）与 `pausedAt`；
     后台加"暂停结算 / 封禁分销商"动作，写审计。
  2. `settleOrder()` / `settleDueOrders()` 在入账前查 `distributorAccount.status !== 'ACTIVE'` → 跳过（保持 `PENDING` 或转 `FROZEN`，见 [P2-10](#p2-10-佣金状态机只有-three-states无独立冻结--风控挂起态)）。
  3. `applyWithdraw()` 增加 `status` 与用户 `User.status` 双重校验（当前完全缺失）。
  4. 后台总览页展示"被封禁 / 已暂停"的人数与冻结金额。

### P1-7 结算 / 冲正的"**流水推进**"与"**账户资金动作**"不在同一事务 → 崩溃即漂移，只能靠人工点修复

- **现象**
  - `settleOrder()`：`claimed = tx.commissionLog.updateMany(...)`（把 PENDING → SETTLED）与 `tx.distributorAccount.upsert(...)`（加余额）**在同一个 `$transaction` 内**。
    这一半是对的。（`commission.service.ts:208-237`）
  - `applyOrderReversal()`：`prisma.commissionLog.updateMany(...)`（CAS 推进 `reversedAmount/reversedCny`）
    与随后的 `prisma.distributorAccount.upsert(...)`（扣余额）**是两条独立语句，没有事务包裹**。（`commission.service.ts:355-378`）
  - `reverseCommissionManually()` 同样如此。（`commission.service.ts:599-617`）
- **为什么是问题**
  若在"流水已标记冲正"与"账户已扣回"之间进程被杀 / DB 闪断，结果是
  **账本说"已冲正"，余额却仍是旧值** → 分销商能多提一笔钱，而且这笔差异**不会自动修复**：
  `verifyAccountConsistency()`（`account.service.ts:65-155`）能查出来，但**必须由管理员手动调用**
  `POST /api/admin/distribution/verify { apply: true }`，没有任何定时任务/告警去驱动它（见 [P3-8](#p3-8-对账差异无告警通道)）。
- **代码位置**
  - `src/server/services/distribution/commission.service.ts:344-380`（`applyOrderReversal` 循环：CAS → 账户扣减，无 tx）
  - `src/server/services/distribution/commission.service.ts:599-617`（`reverseCommissionManually` 同问题）
  - `src/server/services/distribution/account.service.ts:135-145`（修复动作存在，但仅在 `apply=true` 时执行，且无调度调用）
- **建议怎么改**
  1. 把 `applyOrderReversal()` 的单条循环体包进 `prisma.$transaction(async (tx) => {...})`：
     CAS 用 `tx.commissionLog.updateMany`，扣款用 `tx.distributorAccount.upsert`，二者同生共死。
     批量循环时**每条一笔事务**（而不是整批一笔），避免长事务（当前设计已经是逐条推进，改成逐条事务代价很小）。
  2. `reverseCommissionManually()` 同样处理（`commission.service.ts:599-617`）。
  3. 把"账户一致性校验"接入调度器（`scheduler.ts` 的 `runAllJobs`），发现 drift 时**只告警不自动改钱**（自动改钱风险更大），
     同时把 drift 写入告警通道（见 [P3-8](#p3-8-对账差异无告警通道)）。

### P1-8 对账 + 日汇总**每 60 秒全量执行**，与代码自己的注释（"每小时"）不符，规模上会拖垮心跳事务

- **现象**
  - 调度间隔：`src/server/jobs/start.ts:16` → `CRON_INTERVAL_SECONDS` 默认 **60** 秒。
  - 每次心跳都跑 `reconcileDistribution()`（**最多 100 归属 + 100 计佣 + 100+100 冲正 + 100 结算 + 200 到期结算**，逐条开事务）
    与 `rollupDistributionDailyStats({ days: 2 })`（`scheduler.ts:216-220`）。
  - `rollupDistributionDailyStats()` 内部每天 3 个**重量级聚合**，其中
    `distributionRelation.groupBy({ by: ancestorId, where: { depth: gte: 1 } })`（`report.service.ts:1146-1150`）
    **对整张闭包表做全量分组**，与"当天"无关，却每天重算一次 × 每分钟执行。
  - 而 `bridge.runRollup()` 的注释写的是"**调度器每小时调一次**保持当日数据新鲜"（`bridge.ts:122-126`）——**代码与注释不一致**。
  - 这些任务全部运行在**持有 `pg_try_advisory_xact_lock` 的那个 5 分钟事务里**（`scheduler.ts:60-71`，`LEADER_TX_TIMEOUT_MS = 5*60_000`），
    并且同一事务里还有 Stripe 网络 I/O（该文件注释自己承认"在数据库事务里做网络 I/O"是遗留设计问题）。
- **为什么是问题**
  ① **连接池与事务时长**：每 60 秒一次的重量级全量聚合 + 数百次逐条事务，在团队规模上千、订单上万时会把
  持锁事务推向超时；事务一旦超时，**咨询锁提前释放**，多实例下会出现"另一个实例并发跑同一轮"（代码注释已明确这个风险）。
  ② **DB 负载**：闭包表全量 groupBy 每分钟一次，随分销商数量线性增长，是最先爆炸的查询。
  ③ **数据新鲜度收益极低**：分销业绩不是秒级业务，每小时/每 15 分钟足够。
- **代码位置**
  - `src/server/jobs/start.ts:16-34`（60s 心跳）
  - `src/server/jobs/scheduler.ts:60-76`（持锁事务 + 5min 超时）、`:214-220`（两个分销任务）
  - `src/server/services/distribution/report.service.ts:1114-1210`（rollup 全量聚合）
  - `src/server/services/distribution/bridge.ts:122-135`（注释写"每小时"，实际每 60 秒）
- **建议怎么改**
  1. **给两个任务加节流**：在 `bridge` 或 `start.ts` 用一个 `site_settings` 里的 lastRunAt（或进程内时间戳 + 咨询锁）把
     `runRollup()` 限到 **每 60 分钟**、`runReconcile()` 保持每 5 分钟（`reconcile` 是正确性兜底，不能太稀）。
  2. **拆出持锁事务**：把 `runReconcile()` / `runRollup()` 移到 `runAllJobs()` 的咨询锁**之外**，
     或改用"租约表（lockedUntil + 条件更新 + 续租）"让长任务在事务外执行 —— 这是 scheduler 注释里已经写明的重构方向，应当排期。
  3. **rollup 去掉全表聚合**：`teamSize` 不应每分钟从闭包表全量算。改为
     `distribution_relations` 增加 `(ancestorId, depth)` 的**覆盖索引**并只针对"当轮涉及到的用户"查询；
     或把 `teamSize` 改为在下级绑定/晋升事件时增量维护（写时更新比读时全量算便宜得多）。
  4. 修正 `bridge.ts:124` 的注释，或在代码里真的按小时执行（推荐后者 + 在后台提供"手动重跑汇总"按钮，该按钮已存在：`/api/admin/distribution/rollup`）。

---

## 五、P2 发现（中，共 12 条）

### P2-1 自助补绑接口绕开了它自己承诺的"已下单不可补绑"

- **现象**：`/api/distribution/bind` 的注释写"**已下过单的客户不允许补绑 —— 抢绑在这里被挡住**"，
  但该 route 只调 `bindCustomer()`，而 `bindCustomer()` **没有任何 `hasPaidOrders` 校验**；
  `hasPaidOrders()` 只被 `attributeOrder()`（下单流程）调用。
- **代码位置**：`src/app/api/distribution/bind/route.ts:12-15`（承诺）vs `:28-34`（实现）；
  `src/server/services/distribution/bind.service.ts:262-267`（`hasPaidOrders` 定义）、`:326`（唯一调用点）；
  `bind.service.ts:71-259`（`bindCustomer` 无该检查）。
- **为什么是问题**：一个**已自然下单但从未绑定**的老客户，只要本人访问一次带 `?ref=` 的链接并调用该接口（或前端按钮），
  就会被绑定到任意推广人，**此后所有复购都归对方** —— 这是"抢客"的合法化路径，
  且与产品文档/代码注释的口径直接冲突（文档说挡住，代码没挡）。由于历史订单归属已快照、不可改，
  这一条影响的是**未来全部复购**，正是分销激励的大头。
- **建议**：在 `bindCustomer()` 内统一加闸门 `if (await hasPaidOrders(customerId)) return { outcome: "REBIND_DISABLED" }`（或新增 `ALREADY_PURCHASED`），
  并让 `/api/distribution/bind` 返回明确文案；若产品确实允许"复购客户补绑"，则**改注释与产品文档**并加上审核（走 `RebindRequest` 审批流）。

### P2-2 `RebindRequest` 无唯一约束、审批时不校验"来源是否仍成立"

- **现象**：并发调用 `/api/distribution/bind` 时，`findFirst({status:'PENDING'})` 与 `create()` 之间有窗口，
  可产生**多条 PENDING 申请**；审批通过时直接把请求里的 `toDistributorId` 落库，
  **不校验客户当前绑定是否仍等于 `fromDistributorId`**。
- **代码位置**：`src/server/services/distribution/bind.service.ts:114-131`（检查与创建的竞态）；
  `prisma/schema.prisma:853-878`（`RebindRequest` 只有普通索引，无 `@@unique([customerId]) WHERE status='PENDING'` 之类）；
  `bind.service.ts:475-550`（`reviewRebindRequest` 无 from 校验）；`reviewedById` 之外无并发保护（靠 `status !== 'PENDING'` 抛错，属于"事后发现"而非"事前防住"）。
- **为什么是问题**：① 重复申请会污染审核队列，运营可能重复审批；② 若客户在两次申请之间已被换绑，
  批准一条**过期申请**会把客户再换一次，形成"点击—审批—再换"的乱序资金关系变更。
- **建议**：加部分唯一索引 `CREATE UNIQUE INDEX ... ON rebind_requests (customerId) WHERE status = 'PENDING'`（与提现的部分唯一索引同一套做法，PRISMA schema 表达不了，需手写迁移并保留）；
  审批时用条件更新认领：`updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', ... } })`，
  并断言 `getActiveBind(customerId)?.distributorId === request.fromDistributorId`，不一致则拒绝并要求重新发起。

### P2-3 平台报表把 **REVERSED 佣金计入"佣金支出"** → `payoutRatio` 系统性虚高

- **现象**：`getAdminReport()` 里 `commissionTotal = settled + pending + reversed`，
  而 `CommissionLog.amountCny` 是**原始金额、永不因冲正而减少**（冲正记在 `reversedCny`），
  所以一条被全额冲正的流水仍会以原始金额计入"佣金总支出"。
- **代码位置**：`src/server/services/distribution/report.service.ts:674-691`（L678 求和、L690 `payoutRatio`）；
  `src/lib/distribution/rules.ts:216-231`（`summariseCommission` 里 `reversed` 是独立分桶，说明作者知道它不该混入）；
  API：`src/app/api/admin/distribution/reports/route.ts`。
- **为什么是问题**：退款/取消/刷单认定越多，报表显示的佣金支出与 payoutRatio 越虚高，
  管理者会据此**错误地收紧佣金政策**或误判毛利。且与分销员侧口径不一致（分销员侧用净额）。
- **建议**：改为净额口径 `settledNet = Σ(amountCny − reversedCny) where status='SETTLED'`（`pending` 同理），
  `commissionReversedCny` 用 `Σ(reversedCny)`（而不是 `Σ(amountCny) where status='REVERSED'`）；
  在报表页注明"净额口径"。

### P2-4 CSV 导出**无审计**、且**静默截断 10 000 行**

- **现象**：两个导出接口一次性 `take: 10_000`，没有分页/游标/流式，也没有任何"结果被截断"的提示；
  同时这两个接口是后台唯一会**批量导出姓名 + 邮箱 + 收款账户**的地方，却**不写 `audit()`**。
- **代码位置**：`src/server/services/distribution/report.service.ts:1037`（佣金导出 `take: 10_000`）、`:1074`（提现导出）；
  `src/app/api/admin/distribution/commissions/export/route.ts:15-37` 与 `.../withdrawals/export/route.ts:15-32`（均无 `audit`）；
  对照：同目录下所有写操作都调用了 `audit()`。
- **为什么是问题**：① 财务拿到的 CSV 若超过 1 万行会**悄悄少数据**，而没有任何标记，属于"对账文件撒谎"；
  ② 批量 PII / 收款账户外泄时**无法追溯是谁导出的**（合规审计必查项）。
- **建议**：① 导出前后写 `audit({ action: 'DISTRIBUTION_EXPORT_*', meta: { count, filter, truncated } })`；
  ② 用游标分批查询 + 流式响应，或至少在响应头/首行写入 `truncated=true` 并把上限提到可配置；
  ③ 导出内容按角色脱敏（见 [P2-7](#p2-7-角色模型过粗所有分销接口一律-requireadmin无只读财务角色)）。

### P2-5 对账补偿的 "补计佣" 查询会**饥饿**

- **现象**：`reconcileDistribution()` 里 `missing` 查询条件是
  `paidAt != null && status ∈ COMMISSIONABLE && attribution.distributorId != null && commissions.none()`，
  **没有排除"计划结果本来就为空"的订单**（例如受益链只有买家自己、且 `selfPurchaseCommission=false` 时 `planCommissions` 返回 `[]`，
  `accrueForOrder` 返回 `skipped: 'NO_PLAN'`）。这类订单**永远匹配该条件**，
  每 60 秒被重新扫一遍并占用 `take: limit`（默认 100）的配额。
- **代码位置**：`src/server/services/distribution/report.service.ts:746-759`（`missing` 查询 + 循环调 `accrueForOrder`）；
  `src/server/services/distribution/commission.service.ts:144`（`NO_PLAN` 没有落任何标记）。
- **为什么是问题**：当这类订单积累到 100 条以上，**真正漏算佣金的新订单会被挤出配额**，
  对账看起来"跑过了"（有日志、无报错），实际永远补不到 —— 这是"兜底机制静默失效"的最坏形态。
- **建议**：① `accrueForOrder` 在 `NO_PLAN` / `ZERO_BASE` / `NATURAL` 时往 `order_attributions`（或新表 `distribution_skips`）写一个 `accrualSkippedReason`，
  `missing` 查询加上 `attribution.accrualSkippedReason IS NULL`；
  ② `missing` 查询加 `orderBy: { paidAt: 'asc' }` + 游标推进，保证不会永远卡在同一批；
  ③ 给对账加"本轮补了 0 条但候选 > limit"的告警。

### P2-6 反作弊只认 `fromUserId === toUserId`，缺少商用级风控维度

- **现象**：风控视图五类信号中，唯一与"刷单套利"有关的是自购（`fromUserId === toUserId`），
  而默认配置 `selfPurchaseCommission = false`（`contract.ts:131`）意味着**自购返佣根本不会发生**
  —— 这个检测器在默认配置下几乎永远返回空。
  真正的套利路径（**用第二/第三个账号在自己链接下循环下单**）完全不被检测：
  `fromUserId !== toUserId`，风控视图零告警。
- **代码位置**：`src/server/services/distribution/report.service.ts:837-979`（`getRiskReport`；L845-861 selfBuys 查询、L897-909 判定）；
  `src/lib/distribution/contract.ts:131`（`selfPurchaseCommission: false`）；
  无 IP / 设备指纹 / 收货地址 / 手机号 / 支付工具的聚类逻辑（全仓无相关查询）。
- **为什么是问题**：分销系统的头号资金风险就是**自买自返洗佣金**。商用系统的标准做法是
  "同一收货地址/同一手机号/同一支付工具/同一 IP 段下，买家与受益人的关联订单占比超阈值 → 告警并冻结结算"。
  当前实现连"同一收货手机号下单给同一分销商"这种最基础的聚类都没有。
- **建议**：① 用 `orders.addressSnapshot`（已有收货人/手机号/省市）+ 订单 IP（若无则加埋点）做聚类：
  找出"同一手机号/同一详细地址在同一分销商下产生 ≥ N 单且取消/退款率异常"的组合；
  ② 增加"单客户短时间高频下单""同一付款工具跨多账号给同一分销商下单"两类信号；
  ③ 风控命中后支持**一键暂停该分销商结算**（依赖 [P1-6](#p1-6-没有分销商封禁--佣金冻结这个概念禁用账号后在途佣金照常结算入账)）；
  ④ 把 `selfPurchaseCommission` 的检测结果在默认配置下改为"不适用"而不是静默空列表（避免运营误以为风控在工作）。

### P2-7 角色模型过粗：所有分销接口一律 `requireAdmin()`，无只读财务角色

- **现象**：`src/app/api/admin/distribution/**` 全部 22 个路由使用 `requireAdmin()`（仅 `ADMIN` 通过），
  包括**纯读**的总览/流水/报表/导出；而项目里已经有 `requireStaff()`（`ADMIN | SUPPORT`）。
  同时 `/api/admin/distribution/reports`、`/commissions/export`、`/withdrawals/export` 这类财务只读接口也把 `SUPPORT` 排除在外。
- **代码位置**：`src/lib/auth/session.ts:142-153`（`requireStaff` / `requireAdmin` 定义）；
  `src/app/api/admin/distribution/**/route.ts`（逐个 `requireAdmin`，无一处 `requireStaff`，全仓 grep `requireStaff` 在该目录 0 命中）。
- **为什么是问题**：① 财务/客服无法查看提现与佣金，只能借用 ADMIN 账号 → **越权与审计失真**；
  ② "改规则"与"审提现"是两种权限等级的风险（规则能改比例 → 能定向发钱），最少权限原则要求分离。
- **建议**：引入 `DISTRIBUTION_FINANCE`（或复用 SUPPORT）角色：
  只读 + 提现审核走 `requireStaff()`；**规则增删改、等级调整、人工冲正、账户修复**保持 `requireAdmin()`；
  导出接口按角色脱敏（财务可见打款所需字段，客服不可见完整收款账户）。

### P2-8 无结算单 / 完税凭证，分销员前台无任何自助导出

- **现象**：分销中心 8 个页面（dashboard/commissions/customers/orders/rules/subordinates/team/withdrawals）**全部只有屏幕展示**，
  没有"导出我的佣金明细 / 下载月度结算单"入口（`grep export|csv` 在 `src/app/(distribution)/**` 无命中）。
  平台侧也只有裸 CSV（见 [P2-4](#p2-4-csv-导出无审计且静默截断-10-000-行)）。
- **代码位置**：`src/app/(distribution)/distribution/commissions/page.tsx`（无导出）；
  `src/server/services/distribution/report.service.ts:1025-1093`（导出函数均为 admin 专用）。
- **为什么是问题**：分销商要报税、要对账、要跟平台核账，**必须能拿到"某段时间我赚了多少、扣了多少、实付多少"的凭证**。
  没有它，每一笔提现争议都要人工翻库；这也是 [P0-2](#p0-2-提现无个税代扣无净额字段按毛额打款--平台承担扣缴义务风险) 个税合规的载体。
- **建议**：新增 `GET /api/distribution/my/statement?month=YYYY-MM`（返回 CSV/PDF），内容 = 当期佣金明细（含冲正）+ 提现 + 代扣税；
  平台侧同结构可按分销商批量生成。

### P2-9 迁移基线为事后手写，存在 `db push` drift 的部署风险

- **现象**：分销迁移文件自己承认"开发库存在 db push 建的分销表 drift，`migrate dev` 会要求 reset，故用 `migrate deploy` 应用"。
  本地库当前是干净的（27 个迁移全部应用、部分唯一索引存在），
  但**任何"先用 `db push` 建过分销表、后来才切到 migrate deploy"的环境**（开发机、预发、早期生产）在容器启动时
  都会撞上 `P3005`（database schema is not empty）/ `P3009`（failed migration）而**拒绝启动**。
  Dockerfile 的策略是"有 migrations 就 `migrate deploy`，否则 `db push`"，即**一定会走 migrate deploy**。
- **代码位置**：`prisma/migrations/20260921130000_cod_fee/migration.sql`（drift 自述）；
  `Dockerfile:52-54`（`migrate deploy` 启动策略）；`package.json:19-21`（`db:push` / `db:deploy` 并存）。
- **为什么是问题**：不是"缺表"，而是"**老库启动不了**"——比缺表更容易在部署当天炸，且现象是容器起不来（可能被误判为代码问题）。
- **建议**：① 上线前对每个目标环境跑 `npx prisma migrate status`，对 drift 库先用 `prisma migrate resolve --applied <name>` 做**基线对齐**（把已存在的分销迁移标记为已应用），
  再 `migrate deploy`；② 把该步骤写进 `docs/PRODUCTION_CHECKLIST.md` 与 `docs/PRODUCTION_DEPLOY_2026.md`；
  ③ 后续统一走 `migrate dev` 生成迁移，禁止再对已纳入迁移管理的库使用 `db push`。

### P2-10 佣金状态机只有 three-states，无独立"冻结 / 风控挂起"态

- **现象**：`CommissionStatus = PENDING | SETTLED | REVERSED`。
  "风控挂起""争议中""待人工复核"只能用 `note` 字符串表达，查询、统计、阻断结算都没有一等公民。
- **代码位置**：`prisma/schema.prisma`（`enum CommissionStatus`，见 `commission.service.ts:929` 引用处）；`src/lib/distribution/contract.ts:75`；
  `commission.service.ts:200-237`（结算只认 PENDING）。
- **为什么是问题**：顶商分销系统普遍需要 `PENDING → REVIEWING/FROZEN → SETTLED`，
  以便"拒付举证期""刷单核查期""大额人工复核"期间**钱停住但不消失**。当前只能靠改配置的 `settleHoldDays` 全局延长，代价是所有正常佣金一起延迟。
- **建议**：枚举加 `FROZEN`；`settleOrder` 跳过 FROZEN；后台提供"冻结/解冻"动作（写审计）；风控命中自动置 FROZEN（配合 [P2-6](#p2-6-反作弊只认-fromuserid--touserid缺少商用级风控维度)）。

### P2-11 提现的收款账户可被静默改绑，无"二次验证 / 变更冷却"

- **现象**：`applyWithdraw()` 的 KYC 复用逻辑是"取最近一条 `payeeName` 非空的记录，沿用 `payeeName/payeeMethod`"；
  **每次申请可自由传入新的 `payeeName/payeeMethod` 与 `accountInfo`**，覆盖生效，无冷却、无二次验证、无变更通知。
- **代码位置**：`src/server/services/distribution/account.service.ts:250-260`；
  `src/lib/validations/distribution.ts:15-27`（`accountInfo` 只是 `max(200)` 的自由文本，**没有卡号/账号格式校验**）。
- **为什么是问题**：账号被盗后，攻击者只需把收款账户改成自己的即可提走余额（已有的日/月额度与冷却期只限制频率与总额，**不限制"打给谁"**）；
  典型商用做法是"**首次绑定 + 变更需 24h 冷却 + 邮件/短信二次确认**"。
- **建议**：① 新增 `DistributorPayoutAccount` 表（一人一条，含变更历史与 `lockedUntil`）；
  ② 变更收款账户后 24–72 小时内禁止提现，并给用户发通知邮件；
  ③ `accountInfo` 增加按 `payeeMethod` 的格式校验（银行卡 Luhn、支付宝/微信账号规则）；
  ④ 提现审核页高亮"与该用户历史收款账户不一致"。

### P2-12 归因补偿用"**今天的绑定**"回溯历史订单（`enabledAt` 只保护上线前的订单）

- **现象**：`reconcileDistribution()` 对"已支付但没有归属快照"的订单调用 `attributeOrder({ orderId, userId })`
  **不传 `code`**，于是按**当前** `distributor_customer_binds` 判定归属。
  `getDistributionEnabledAt()` 基线只把"模块上线之前创建"的订单一次性写成 natural，
  **对"上线之后、但归属钩子失败"的订单没有任何时间边界校验**。
- **代码位置**：`src/server/services/distribution/report.service.ts:719-744`（`enabledAt` + 补归属）；
  `src/server/services/distribution/bind.service.ts:301-377`（`attributeOrder` 读当前绑定）；
  `prisma/schema.prisma:798-820`（`DistributorCustomerBind` **确实存了 `bindTime`/`releasedAt`**，具备按时间还原的能力但未被使用）。
- **为什么是问题**：若客户在订单创建后、补偿执行前发生了换绑（审批通过），
  这笔订单会被**错误地归给新上级**，而按产品规则"下单时归属固化"。窗口可能很长（钩子连续失败 / 模块被临时关闭再开启）。
- **建议**：`attributeOrder()` 支持传入 `at`（订单 `createdAt`），
  按"`bindTime <= at` 且（`releasedAt is null` 或 `releasedAt > at`）"选取当时有效的绑定；
  `reconcileDistribution` 传入 `order.createdAt`。这样 `enabledAt` 就只作为"不回溯上线前订单"的产品策略，而不是正确性的唯一防线。

---

## 六、P3 发现（建议，共 8 条）

### P3-1 `ensureDefaultCommissionRules()` 被放在**每次计佣**的路径上

- **现象/位置**：`commission.service.ts:118` 每笔支付订单都调一次；该函数内部是
  `findMany(全部 GLOBAL 规则)` + 可能 `deleteMany(重复行)` + `updateMany(scopeId null → '')`（`config.service.ts:237-278`）。
- **为什么是问题**：① 每笔订单多 1–3 次查询（有索引，但不必要）；② 更危险的是它**会删除"重复"的 GLOBAL 行**（保留 `updatedAt` 最新的一条），
  如果运营/脚本有意保留了多条历史规则用于灰度，会被静默清掉。
- **建议**：把"自愈"从**热路径**移到**冷路径**：只保留在后台规则页（`/api/admin/distribution/rules` 已调用）与模块启动时；
  计佣路径改为"规则表为空时直接用 `DEFAULT_COMMISSION_RATIOS` 兜底"，不做写操作。

### P3-2 部分冲正后，团队订单列表仍显示**原始佣金**

- **位置**：`src/server/services/distribution/report.service.ts:214-216`（`myCommissionCny: l.status === 'REVERSED' ? 0 : Number(l.amountCny)` —— 部分冲正不是 REVERSED，仍显示全额）。
- **建议**：改用 `amountCny − reversedCny`。

### P3-3 通知邮件的 CTA 链接可能失效

- **位置**：`src/server/services/distribution/notify.service.ts:95` → `ctaUrl: \`${process.env.SITE_URL ?? ""}${params.link}\``。
- **为什么是问题**：项目统一从 `src/lib/env.ts` 读 `env.SITE_URL`（带校验与默认值）；直接读 `process.env` 时若未设置，
  邮件里的按钮会变成相对路径 `/distribution/commissions`，在邮件客户端里点不开。
- **建议**：统一用 `env.SITE_URL`，并在为空时**不渲染按钮**。

### P3-4 `termsAcceptedAt` 只记时间，不记**条款版本**

- **位置**：`prisma/schema.prisma:960-961`；`account.service.ts:262-273`（首次提现时若未确认则**服务端自动补写确认时间**）。
- **为什么是问题**：① 条款变更后无法证明用户确认的是哪一版（合规举证不足）；
  ② 服务端在 `acceptTerms=true` 缺失时**自行补写确认时间**属于"代用户同意"，法律意义存疑（虽然 `withdrawApplySchema` 要求 `acceptTerms: z.literal(true)`，前端也传了，但服务端这个兜底分支应改为**拒绝**而不是**补写**）。
- **建议**：加 `termsVersion` + `termsAcceptedIp`；把 `account.service.ts:267-273` 的自动补写改为 `throw badRequest('请先阅读并同意分销规则')`。

### P3-5 `verifyAccountConsistency()` 全表加载所有账户

- **位置**：`src/server/services/distribution/account.service.ts:70-73`（`findMany()` 不带分页）。
- **建议**：改成分批游标 + 只校验"有余额/冻结非零或近 90 天有流水"的账户，避免分销商上万时把内存打满。

### P3-6 RATIO 与 FIXED 混用时，"总比例上限"口径不统一

- **位置**：`src/lib/distribution/rules.ts:190-206`。FIXED 分支累加 `totalAmount`（含此前 RATIO 的金额）来判断上限；
  RATIO 分支只累加 `totalRatio`，**不把 FIXED 已占用的额度折算进来**。
- **为什么是问题**：混合模式下可能突破 `maxTotalRatio` 的意图（先拿固定额、再按比例叠加）。
- **建议**：统一折算成金额口径判断（FIXED 的"等效比例"已经在注释里提到，把 RATIO 分支也换算成金额累计即可）。

### P3-7 没有推广链接点击流 / 归因日志，争议无法举证

- **位置**：`src/proxy.ts:118-126`（只写签名 cookie，**不落库**）；`OrderAttribution` 只有最终结果。
- **建议**：加轻量 `distribution_clicks`（code、时间、IP 哈希、UA 哈希、落地页），
  既能支撑"谁先带来这个客户"的争议仲裁，也是 [P2-6](#p2-6-反作弊只认-fromuserid--touserid缺少商用级风控维度) 反作弊的数据基础。

### P3-8 对账差异无告警通道

- **位置**：`account.service.ts:148-153` 只 `logger.warn`；`report.service.ts:802-807` 只 `logger.info`。
  项目已有 `captureMessage`（`scheduler.ts` 在用）与通知中心，但分销对账**都不用**。
- **建议**：drift > 0 / 补偿动作数异常 / 对账一轮耗时超阈值 → `captureMessage(..., 'error')` + 通知管理员；
  后台总览页顶部展示"待处理告警"。这是 [P1-7](#p1-7-结算--冲正的流水推进与账户资金动作不在同一事务--崩溃即漂移只能靠人工点修复) 能"被及时看见"的前提。

---

## 七、八大商业维度逐项结论

### 7.1 归因与绑定

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 首触/末触 | **末触写 cookie + 首触定绑定**：链接每次覆盖 cookie（末触），但绑定一旦成立不再覆盖（首触定终身） | `src/proxy.ts:118-126`（每次带 ref 就重签 cookie）；`bind.service.ts:99-109`（已绑定不覆盖） |
| cookie 有效期与覆盖 | 30 天固定窗口（`DIST_REF_COOKIE_TTL_DAYS=30`），签名含 `issuedAt`，服务端二次校验时限；**httpOnly + SameSite=Lax**（跨站顶级导航可带） | `contract.ts:35`；`referral.ts:57-83`；`proxy.ts:260-267` |
| 自推自买防护 | **有，但只防"物理自绑"**：`bindCustomer` 拒绝 `distributor.id === customerId` | `bind.service.ts:88-90` |
| 跨设备/清 cookie | 绑定表是唯一权威（`getActiveBind` 优先于 cookie），换设备/清 cookie 不影响复购归属 ✓ | `bind.service.ts:22-27, 325-341` |
| 绑定冲突与改绑 | 冲突由 `customerId @unique` 保证不可抢绑 ✓；改绑需 `allowRebind` 且**默认走人工审核** ✓ | `schema.prisma:802`；`bind.service.ts:111-152` |
| **改绑审批流缺陷** | 无 PENDING 唯一约束、审批不校验来源现状 → [P2-2](#p2-2-rebindrequest-无唯一约束审批时不校验来源是否仍成立) |
| **绑定失效死角** | 过期/上级被禁用后客户**永久锁死** → [P1-4](#p1-4-绑定失效过期--上级被禁用后客户被永久锁死再也无法归属任何分销商) |
| **解绑不彻底** | 解绑不重建闭包，旧上级继续抽佣 → [P1-5](#p1-5-管理员解绑releasebind不重建闭包--旧上级继续从整棵子树抽佣) |
| 退款/取消后归因回滚 | **不回滚**（归属快照不可变），改为**按比例冲正佣金** —— 这是正确设计 ✓ | `bind.service.ts:298-300`；`commission.service.ts:292-437` |
| 补绑规则 | 注释承诺"已下单不可补绑"，代码未实现 → [P2-1](#p2-1-自助补绑接口绕开了它自己承诺的已下单不可补绑) |

### 7.2 佣金计算

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 计算基数 | `subtotal − discount`（**不含运费/税**），符合"运费是成本"的商业口径 ✓ | `commission.service.ts:69-71` |
| 比例/固定额 | RATIO 与 FIXED 双模式，`resolveRule` 统一出口 ✓ | `rules.ts:55-92, 190-197` |
| 多级分层 | 闭包表逐级 + `maxCommissionLevels`（合规硬夹 3 级）+ `maxTotalRatio` 总闸门 ✓ | `relation.service.ts:54-67`；`config.service.ts:33-43`；`rules.ts:158-207` |
| 等级差异化 | **规则模型有 P0 缺陷**（唯一键不含 tierLevel → 通用规则被覆盖、他等级归零）→ [P0-1](#p0-1-等级差异化佣金规则会覆盖通用规则并让非该等级的分销商在该层级佣金静默归零) | `schema.prisma:901`；`rules.ts:74-78` |
| 团队佣金 | 只按 depth 逐级比例，**无"团队业绩奖/级差/平级奖"**（见第九章） | `rules.ts:135-210` |
| 规则快照 | 佣金流水落库 `ratio`/`fixedAmount` 派生结果与 `baseAmount`/`currency`/`exchangeRate` 折算结果 ✓；**规则变更不影响历史流水** ✓ | `schema.prisma:906-952`；`commission.service.ts:148-159` |
| 部分退款冲正 | 增量 + CAS 幂等，机制正确 ✓；**但比例分母口径错误** → [P1-1](#p1-1-冲正分母用-ordertotal计佣基数用-subtotal--discount--系统性多冲少冲) | `commission.service.ts:320-437` |
| 多次退款 | 增量推进 `reversedAmount/reversedCny`，反复调用不重复扣 ✓（集成测试有覆盖） | `commission.service.ts:350-366`；`tests/integration/distribution.test.ts:1004-1033` |
| 状态机与冻结期 | 三态 + `settleHoldDays`（默认 15 天）+ 确认收货立即结算 ✓；**无 FROZEN 态** → [P2-10](#p2-10-佣金状态机只有-three-states无独立冻结--风控挂起态) | `contract.ts:133`；`commission.service.ts:443-465` |

### 7.3 结算与提现

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 最低提现额 | 有（默认 100 CNY），前后端都校验 | `contract.ts:134`；`account.service.ts:237-239` |
| 余额与冻结额 | 语义清晰（balance=可提现、frozen=在途），**扣减与建单在同一事务** ✓ | `account.service.ts:284-327` |
| 并发提现 | 三层防护：应用层 in-flight 检查 + 原子条件扣减 + **DB 部分唯一索引**（已实测存在）✓ | `account.service.ts:245-248, 296-316`；`migrations/20260921120000_*`；`psql` 实测 |
| 打款状态流转 | PENDING→APPROVED→PAID / REJECTED，全部用条件更新认领，非法流转抛 conflict ✓ | `account.service.ts:353-445` |
| 失败回滚 | 驳回解冻退回余额 ✓；**无"打款失败"这一状态**（线下打款失败只能靠驳回，语义不准） | `account.service.ts:398-417` |
| 税务/发票 | **完全缺失**（无税额、无净额、无完税凭证）→ [P0-2](#p0-2-提现无个税代扣无净额字段按毛额打款--平台承担扣缴义务风险) | `schema.prisma:978-1011`；全仓 0 命中 |
| 提现流水与对账 | 有账户一致性推导与修复 ✓；但修复需人工触发、无告警 → [P1-7](#p1-7-结算--冲正的流水推进与账户资金动作不在同一事务--崩溃即漂移只能靠人工点修复) / [P3-8](#p3-8-对账差异无告警通道) | `account.service.ts:44-155` |
| 额度风控 | 日 5 000 / 月 50 000 / 冷却期，可配 ✓；**收款账户可静默改绑** → [P2-11](#p2-11-提现的收款账户可被静默改绑无二次验证--变更冷却) | `account.service.ts:169-222` |

### 7.4 对账 / 补偿

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 定时对账幂等 | ✓ 四类补偿全部复用幂等函数（`attributeOrder` / `accrueForOrder` / `syncOrderReversal` / `settleOrder`） | `report.service.ts:706-809` |
| 掉单/漏单补偿 | ✓ 补归属、补计佣、补冲正、到期结算、账户修复（手动） | 同上；`account.service.ts:65-155` |
| **补偿饥饿** | 永不产生佣金的订单会反复占用配额 → [P2-5](#p2-5-对账补偿的-补计佣-查询会饥饿) | `report.service.ts:746-759` |
| 异常告警 | **缺失** → [P3-8](#p3-8-对账差异无告警通道) | `account.service.ts:148`；`report.service.ts:802` |
| 数据修复能力 | ✓ 账户修复（按流水口径重算）、汇总可重跑、管理端可手动结算 | `account.service.ts:135-145`；`/api/admin/distribution/{verify,rollup,settle}` |
| 执行频率 | 每 60 秒，含全量聚合，与注释不符 → [P1-8](#p1-8-对账--日汇总每-60-秒全量执行与代码自己的注释每小时不符规模上会拖垮心跳事务) | `start.ts:16`；`scheduler.ts:216-220`；`bridge.ts:122-135` |

### 7.5 并发与数据一致性

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 事务边界 | 结算 ✓、提现申请/审核 ✓；**冲正 ✗** → [P1-7](#p1-7-结算--冲正的流水推进与账户资金动作不在同一事务--崩溃即漂移只能靠人工点修复) | `commission.service.ts:208-237, 344-378` |
| 行锁/唯一索引 | 订单行锁（退款累计封顶）✓；`customerId @unique` ✓；`(orderId,toUserId,level)` ✓；部分唯一索引 ✓；**`RebindRequest` 缺** → [P2-2](#p2-2-rebindrequest-无唯一约束审批时不校验来源是否仍成立) | `admin/refunds/[id]/route.ts:89-112`；`schema.prisma:802, 947` |
| 重复回调幂等 | ✓ `createMany({skipDuplicates})` + `count` 前置检查 + CAS | `commission.service.ts:105-106, 173` |
| 竞态：并发退款 | ✓ 订单行锁 + `status='REQUESTED'` 条件认领 | `admin/refunds/[id]/route.ts:89-112`；`orders/[orderNumber]/refund/route.ts:36-67` |
| 竞态：并发提现 | ✓ 三层防护（实测索引存在） | 见 7.3 |
| 竞态：并发绑定 | ✓ 依赖 `customerId @unique`；**换绑申请创建竞态未防** → [P2-2](#p2-2-rebindrequest-无唯一约束审批时不校验来源是否仍成立) | `bind.service.ts:92-218` |
| 竞态：并发结算/冲正 | ✓ CAS 条件更新；有集成测试（5 并发） | `commission.service.ts:220-224, 355-366`；`tests/integration/distribution.test.ts:973-1033` |

### 7.6 权限与安全

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 分销员看他人数据 | **未发现越权**：所有 `/api/distribution/my/*` 均 `requireUser()` 后以 `user.id` 为过滤条件，服务端分页 | `src/app/api/distribution/my/**`（13 个 route 全部核对） |
| 越权改佣金/提现 | 分销员侧**无**写佣金/提现审核入口；提现只能申请自己的 ✓ | 同上；`/api/distribution/withdraw` |
| 管理端权限 | 全部 `requireAdmin()`（**过严而非过松**）→ [P2-7](#p2-7-角色模型过粗所有分销接口一律-requireadmin无只读财务角色) | 22 个 admin route |
| 敏感数据脱敏 | ✓ **服务端**脱敏（`maskName/maskEmail/maskPhone/maskRegion/maskAccountInfo`），间接下级只给汇总，详细地址不下发 | `src/lib/distribution/mask.ts`；`report.service.ts:33-36, 148-165, 279-291` |
| 自推自买/刷单套利 | 只防物理自绑 + 默认关闭自购佣金；**缺多账号聚类** → [P2-6](#p2-6-反作弊只认-fromuserid--touserid缺少商用级风控维度)；**且绑定的"闭环/互推"未被检测**（见附录不确定项） | `bind.service.ts:88-90`；`contract.ts:131`；`report.service.ts:897-909` |
| 金额精度 | ✓ 全链路 `Decimal(10/12,2)` + 落库前 `round2`；**无浮点误差**（唯一需要注意：`round2` 是"乘 100 取整"的二进制浮点实现，对 ±0.005 的极端尾数存在理论误差，但金额已先被 DB 约束为 2 位小数，实务上安全） | `schema.prisma:921-934`；`rules.ts:111-113` |
| 结算口径安全 | ✓ `maxTotalRatio` 总闸门 + FIXED 等效比例 + 收益 `< 0.01` 不入账 | `rules.ts:186-207` |

### 7.7 可运营性

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| 后台配置项 | 12 项可配（绑定触发/换绑/绑定时效/层级/总比例/自购×2/持有期/最低提现/日限额/月限额/冷却）✓ | `contract.ts:95-140`；`admin/distribution/rules` `config` route |
| 后台视图 | 10 个（总览/分销商/关系链/规则/流水/提现/报表/换绑/风控/升级记录）✓ | `src/app/admin/distribution/**` |
| 分销员后台可用性 | 8 个页面 + 推广链接/二维码/海报，`my/rules` 动态渲染真实规则（不会与结算口径漂移）✓ | `src/app/(distribution)/**`；`api/distribution/my/rules/route.ts` |
| 数据导出 | 平台 CSV ✓（含 Excel 注入防护）；**分销员无导出** → [P2-8](#p2-8-无结算单--完税凭证分销员前台无任何自助导出)；导出**无审计 + 静默截断** → [P2-4](#p2-4-csv-导出无审计且静默截断-10-000-行) |
| 通知触达 | 站内信（中英双份）+ 邮件双通道，覆盖晋升/结算/冲正/提现四态 ✓；**CTA 链接来源不统一** → [P3-3](#p3-3-通知邮件的-cta-链接可能失效) | `notify.service.ts`；`templates.tsx:871` |
| 封禁/风控 | **不足**：无分销商级冻结/封禁，禁用用户不等于止付 → [P1-6](#p1-6-没有分销商封禁--佣金冻结这个概念禁用账号后在途佣金照常结算入账) |
| 告警 | **缺失** → [P3-8](#p3-8-对账差异无告警通道) |

### 7.8 工程化

| 子项 | 结论 | 证据 |
| --- | --- | --- |
| DB 迁移 | **齐全**（8 张表 + 后续 7 个增量迁移）；本地库 `migrate status` 全绿；部分唯一索引实测存在 → 任务书假设**证伪**；但存在历史 drift 部署风险 → [P2-9](#p2-9-迁移基线为事后手写存在-db-push-drift-的部署风险) | `prisma/migrations/**`；`npx prisma migrate status`；`psql \d withdraw_records` |
| 单测/集成测试 | **1 768 行 / 30+ 用例**，覆盖绑定、逐级分佣、幂等、部分退款、提现闭环、行级权限、对账补偿、账户修复、并发、大团队性能、等级、汇总 —— 覆盖度在同类项目里属上乘 ✓；**但恰好漏掉了本次 P0-1 / P1-1 / P1-2 / P1-3 的口径断言**（见各条"建议补测试"） | `tests/integration/distribution.test.ts`；`tests/unit/distribution.test.ts` |
| 类型安全 | TS 严格模式；DB→DTO 全部显式 `Number()` 转换（避免 `Decimal` 泄漏到 JSON）；`contract.ts` 作为客户端可引用的纯类型层 ✓ | 全量通读 |
| 错误处理 | `apiHandler` 统一包装；分销模块对商城**全异常吞掉**（`bridge.ts` 三条铁律）✓；但**对账内部错误只记日志不告警** → [P3-8](#p3-8-对账差异无告警通道) |
| 索引与性能 | 关键索引齐备（`(toUserId,status,createdAt)`、`(orderId)`、`(status,createdAt)`、`(descendantId,depth)`、`(distributorId,createdAt)`）；**`(ancestorId, depth)` 缺独立索引**（`distribution_relations` 主键是 `(ancestorId,descendantId)`，`@@index([descendantId, depth])` 只覆盖向下查祖先，**向上查下级/团队人数走的是主键前缀或全表**）→ rollup 的 `groupBy(ancestorId)` 与 `getDescendantIds()` 都是这条路径 | `schema.prisma:789-790, 947-950, 1028-1029`；`report.service.ts:1146-1150` |
| 分页 | 列表接口全部 `parsePagination`（`maxPageSize=100`）✓；**导出接口例外**（一次性 10 000） | `src/lib/utils.ts:72-83` |

---

## 八、本次审查确认"做对了"的部分（改之前先读）

这一节是**防止后来者误伤**——以下都是经过核对、有明确设计意图的正确实现：

1. **闭包表关系链**（`DistributionRelation`，`schema.prisma:773-792`）：一次索引查询取全部上级，避免 `path LIKE '%/id/%'` 全表扫；
   depth=0 是自己这一行，查询无需特判。注释里把"为什么不用递归/不用路径"讲清楚了。
2. **`DistributorCustomerBind.customerId @unique`**（`schema.prisma:802`）："不可抢绑"是**数据库级**保证，应用层判重会被并发穿透 —— 这个认识是对的。
3. **佣金幂等键 `(orderId, toUserId, level)` + `createMany({skipDuplicates})`**（`schema.prisma:947`；`commission.service.ts:173`）：
   重复支付回调、并发补算都不会重复计佣。
4. **结算"条件更新认领"在事务内**（`commission.service.ts:208-237`）：并发结算同一订单只有一方能入账，且入账与状态推进同生共死。
5. **受益人快照 + 财务表 `SetNull` 而非级联删除**（`schema.prisma:916-918, 935-937, 980-983`）：
   用户注销后账本、打款凭证、个税凭证仍在 —— 这是财务系统该有的样子。
6. **部分退款按比例**增量冲正（`reversedAmount/reversedCny` + CAS），不是一刀切全额冲正（`commission.service.ts:310-423`）。
7. **`GLOBAL` 规则用空串而非 NULL**（`rules/route.ts:13-24` + `config.service.ts:230-261`）：
   作者发现了"PG 唯一索引里 NULL 互不相等 → 同层级可插多条 → 比例随机"这个真实坑并修了。
8. **合规硬夹**：`clampCommissionLevels()` 每次读配置都夹（`config.service.ts:33-43`），
   把"三级红线"从"默认值"升级为"服务端强制"，并要求显式环境变量才放开 —— 这是合规意识正确的体现。
9. **`bridge.ts` 三条铁律**（`bridge.ts:7-23`）：商城只 import 一个文件、分销异常全吞、开关一关逐字节回到接入前；
   并且用**动态 import** 把分销的编译/循环依赖风险挡在商城启动路径之外。
10. **"钩子只是加速器，正确性由对账保证"的分工**（`bridge.ts:20-22`）+ 手动触发入口（reconcile/rollup/settle/verify）：
    这个架构判断是对的，本次的 P1-8 只是"执行频率与实现方式"问题，不是方向问题。
11. **服务端脱敏 + 间接下级只给汇总**（`mask.ts` 全文；`report.service.ts:33-36`）：符合"不能只靠前端隐藏"的要求。
12. **`my/rules` 接口动态下发真实规则**（`api/distribution/my/rules/route.ts:12-22`）：
    避免"页面说 10%、实际算 5%"这类最招投诉的漂移。
13. **`settleOrder` 的通知刻意不 await**（`commission.service.ts:239-268`）：邮件绝不拖慢资金操作。
14. **提现原子化 + 部分唯一索引 + 日/月额度 + 冷却期**：三层防护叠加，工程完成度高。

---

## 九、距离"顶级商用分销"还缺什么（功能清单 + 优先级路线图）

### 9.1 功能缺口清单（按重要性）

| # | 缺口 | 为什么顶商系统必须有 | 关联发现 |
| --- | --- | --- | --- |
| 1 | **个税代扣 + 净额/完税凭证** | 国内合法打款的前提；也是财务对账的基础 | P0-2 |
| 2 | **拒付/争议事件处理 + 争议期冻结** | 拒付是真实损失，佣金会把损失放大一次 | P0-3、P2-10 |
| 3 | **等级规则的"通用+等级"并存模型** | 等级体系是分销激励的核心玩法，当前模型不可用 | P0-1 |
| 4 | **分销商生命周期状态机**（申请/审核/ACTIVE/SUSPENDED/BANNED）+ 结算冻结 | 风控处置、合规收缩（如"禁止团队计酬"）都靠它 | P1-4、P1-6 |
| 5 | **多维度反作弊**（同地址/同手机号/同支付工具/同 IP/退款率聚类）+ 自动冻结 | 自买自返是分销的头号资金风险 | P2-6 |
| 6 | **对账告警与差异阻断**（drift → 告警 + 该用户止付） | "查得出"不等于"兜得住" | P3-8、P1-7 |
| 7 | **月度结算单 / 对账单**（平台与分销员双侧，含代扣税） | 商业化对账与报税刚需 | P2-8 |
| 8 | **提现收款账户簿 + 变更冷却 + 二次确认** | 账号盗用后的最后一道闸门 | P2-11 |
| 9 | **团队计酬玩法**：级差/平级奖/团队业绩奖/月度冲刺激励 | 顶商系统激励体系的标准组件；当前只有固定逐级比例 | 7.2 |
| 10 | **归因点击流 + 归因窗口可配（首触/末触/自定义）+ 争议仲裁界面** | 联盟体系的法律与商务基础（"谁带来的"要有证据） | P3-7、P2-12 |
| 11 | **细粒度角色与权限**（财务/客服/运营分离，导出脱敏） | 内控与合规审计要求 | P2-7、P2-4 |
| 12 | **分销员自助导出 / 结算单下载** | 减少客服工单，提升分销员信任 | P2-8 |
| 13 | **自动代付通道**（Stripe Connect / 支付宝转账 / 微信企业付款）+ KYC 证件 | 从"线下打款"升级为规模化的必经之路 | 现有注释已列为已知取舍 |
| 14 | **多币种结算能力**（当前佣金/提现统一 CNY，境外分销商无解） | 跨境分销的必备能力 | COMMISSION_CURRENCY 固定 CNY |
| 15 | **性能与可观测性**：`(ancestorId, depth)` 索引、任务租约化、报表预聚合增量维护、慢查询监控 | 规模化的前提 | P1-8、7.8 |
| 16 | **A/B 与灰度能力**：同层级多规则并存（灰度比例）、按分销商白名单试算 | 佣金政策调整需要灰度，现在的模型一改就是全量 | P0-1 修复后的自然收益 |
| 17 | **佣金试算器**（后台输入订单/关系，预览各级金额） | 运营改规则前必须能预演，否则每次改规则都是赌博 | — |
| 18 | **用户侧透明账本**：每笔佣金的"基数 × 比例 = 金额"逐步展示 + 冲正原因 | 减少纠纷的性价比最高的功能 | P3-2 |

### 9.2 优先级路线图

**第 0 阶段（上线前必修，预计 3–5 人日）** —— 不解就别开真实提现

| 序 | 动作 | 涉及文件 | 预估 |
| --- | --- | --- | --- |
| 0-1 | 修等级规则唯一键 + `resolveRule` 匹配逻辑 + 迁移归一化 `tierLevel` | `prisma/schema.prisma`、新迁移、`src/lib/distribution/rules.ts`、`src/app/api/admin/distribution/rules/route.ts` | 1 天 |
| 0-2 | 修冲正分母口径（改为按计佣基数），并限制退款金额只针对商品额 | `src/server/services/distribution/commission.service.ts:292-308`、退款申请/审批 route | 0.5 天 |
| 0-3 | 修日汇总币种折算 + 统一汇总/实时口径 | `src/server/services/distribution/report.service.ts:1127-1161, 324-351` | 0.5 天 |
| 0-4 | `applyOrderReversal` / `reverseCommissionManually` 包事务 | `src/server/services/distribution/commission.service.ts:344-378, 599-617` | 0.5 天 |
| 0-5 | 绑定有效性判定统一到 `getActiveBind`；解绑重建闭包 | `src/server/services/distribution/bind.service.ts:99-109, 380-405` | 0.5 天 |
| 0-6 | 补 4 条回归测试（等级通用兜底、含运费全退、CNY/USD 汇总、解绑后不再分佣） | `tests/integration/distribution.test.ts` | 0.5 天 |
| 0-7 | 对账任务降频 + 移出持锁事务 + `(ancestorId, depth)` 索引 | `src/server/jobs/scheduler.ts`、`src/server/services/distribution/report.service.ts`、新迁移 | 0.5 天 |

**第 1 阶段（首月，合规与"钱不能丢"）**

| 序 | 动作 | 关联 |
| --- | --- | --- |
| 1-1 | 接 Stripe 争议事件 → 复用 `syncOrderReversal` + `FROZEN` 状态 | P0-3 / P2-10 |
| 1-2 | `WithdrawRecord` 加 毛额/税/实付/税号 + 代扣口径 + 后台展示 | P0-2 |
| 1-3 | 分销商状态机（ACTIVE/SUSPENDED/BANNED）+ 暂停结算 + 提现校验 | P1-6 |
| 1-4 | 对账 drift 告警通道 + 后台总览告警位 + 邮箱/站内通知 | P3-8 |
| 1-5 | 导出接口补审计 + 去截断 + 按角色脱敏 | P2-4 / P2-7 |
| 1-6 | 归因补偿按订单时间还原绑定 | P2-12 |

**第 2 阶段（第 2–3 月，可运营性与风控）**

| 序 | 动作 | 关联 |
| --- | --- | --- |
| 2-1 | 多维度反作弊聚类 + 命中自动 FROZEN | P2-6 |
| 2-2 | 收款账户簿 + 变更冷却 + 二次确认 + 通知 | P2-11 |
| 2-3 | 月度结算单（平台/分销员双侧，CSV+PDF） | P2-8 |
| 2-4 | 分销员自助导出 + 每笔佣金"基数×比例"明细展示 | P3-2 / P2-8 |
| 2-5 | 换绑申请的 DB 级唯一约束 + 审批前置校验 | P2-2 |
| 2-6 | 补绑规则的"已下单"闸门（或按产品决定改文档） | P2-1 |
| 2-7 | 点击流归因日志 + 归因窗口可配 | P3-7 |
| 2-8 | 佣金试算器 + 规则灰度 | 9.1 #16/#17 |

**第 3 阶段（第 4–6 月，规模化与顶级能力）**

| 序 | 动作 |
| --- | --- |
| 3-1 | 团队计酬体系（级差/平级奖/团队业绩奖/月度冲刺）——需要新的 `CommissionRule.mode`（`DIFF`/`PEER_BONUS`/`TEAM_BONUS`）与订单级重算管道 |
| 3-2 | 自动代付 + KYC 证件（对象存储 + 字段加密，复用 `channel-crypto-core`） |
| 3-3 | 多币种结算（`CommissionLog.currency` 已有，需账户/提现多币种化） |
| 3-4 | 任务租约化（替换"事务里持咨询锁 + 网络 I/O"）与分销专用只读副本/物化视图 |
| 3-5 | 数据看板（分渠道 ROI、LTV、退款-佣金联动分析、异常分销商排行） |

---

## 十、附录：核验方法与"需确认"清单

### 10.1 本次如何核验（可复现）

| 结论 | 核验方式 |
| --- | --- |
| 迁移齐全、无缺表 | `npx prisma migrate status` → "27 migrations found / Database schema is up to date!" |
| 提现部分唯一索引真实存在 | `psql "\d withdraw_records"` → `withdraw_records_one_inflight_per_user UNIQUE ... WHERE status = ANY(...)` |
| 日汇总销售额折算错误 | 只读 SQL 对比 `distribution_daily_stats.salesCny` 与 `orders.total/exchangeRate`：CNY 单 402.28 被写成 2 697.17；USD 单 45 被写成 45.00（应为 301.71） |
| 汇率语义 | `src/server/services/order.service.ts:386`（`exchangeRate = rateSnap.rates[userCurrency]`）+ `schema.prisma:21-22` 注释 + 库内实测（CNY 单 `exchangeRate=6.704712`，`fx.rates.CNY=6.704712`） |
| 冲正口径不一致是主路径 | 只读 SQL：`orders` 中 **87/96 含运费**（`shippingFee > 0`） |
| 等级规则撞键 | `prisma/schema.prisma:901` 唯一键 + `rules/route.ts:59-84` upsert 键 + `rules/page.tsx:913-918` 后台输入框 + `tests/integration/distribution.test.ts:1120-1132`（测试自己就撞了这个键） |
| 全仓无争议/税务字段 | `grep -rni "dispute\|chargeback" src/ prisma/schema.prisma` → 0 命中；`grep "taxAmount\|netAmount\|feeAmount\|withheld" prisma/schema.prisma` → 0 命中 |
| 分销员侧无越权 | 逐个读 `src/app/api/distribution/my/**`（13 个 route），全部 `requireUser()` + `user.id` 过滤 |

> 以上 SQL 全部为 `SELECT`，未对数据库做任何写入；未修改任何源码、配置或迁移文件。

### 10.2 需确认事项（我不确定，请大爷或产品/运营确认）

1. **COD（货到付款）订单是否应当产生佣金？**
   现状：COD 单创建即 `PROCESSING`，**从不设置 `paidAt`**（`order.service.ts:519-556`，注释明确"永不经过 `markOrderPaid`"），
   而 `accrueForOrder`（`commission.service.ts:95`）、`reconcileDistribution` 的孤儿/补佣查询（`report.service.ts:723-755`）
   全部以 `paidAt != null` 为门槛 → **COD 订单永远不会产生任何佣金，也没有"现金已收"的确认动作**。
   如果 COD 是主力渠道，这对分销商是不可接受的（推广了却拿不到钱）；如果是刻意排除（款未到账），
   则应在分销规则页明示"货到付款订单不计佣"，并加一个"确认 COD 收款 → 补记 `paidAt` + 计佣"的运营动作。
   **怎么确认**：问产品/运营 COD 占比与佣金政策，或查 `orders.paymentProvider='cod'` 的数量与占比。
2. **`bindExpireDays` 过期后是否允许客户重新绑定？**
   现状代码是"不允许"（见 [P1-4](#p1-4-绑定失效过期--上级被禁用后客户被永久锁死再也无法归属任何分销商)）。
   如果产品本意是"过期即释放、可被重新绑定"，那 P1-4 的修复优先级要从 P1 提到**P0**（当前默认 `bindExpireDays=0` = 永久，所以线上还没炸）。
   **怎么确认**：查 `site_settings.distribution.bindExpireDays` 是否为 0；问产品。
3. **`SUPPORT` 角色是否应当能看分销报表/审提现？**
   现状一律 `requireAdmin`。若运营上确实由 ADMIN 兼财务，则 [P2-7](#p2-7-角色模型过粗所有分销接口一律-requireadmin无只读财务角色) 降级为 P3；若客服需要代办，则维持 P2。
   **怎么确认**：问运营团队谁负责审提现。
4. **分销关系是否允许"互推闭环"（A 的上级是 B、B 的上级是 A）？**
   代码有**单点防护**：`planClosureRows` 会丢弃 `a.userId === descendantId` 的祖先（`rules.ts:255`），
   所以 A 不会成为自己的祖先；但 **A→B→A 的双向互推是允许的**（A 赚 B 订单的佣金、B 赚 A 订单的佣金），
   我没有找到针对这种情况的检测或限制。是否属于合规/风控要拦的情况，需产品确认。
   **怎么确认**：只读 SQL 查 `distribution_relations` 中是否存在 `(x,y,1)` 与 `(y,x,1)` 并存；问产品。
5. **`getTeamStats` 的"团队业绩"到底应不应该包含下级团队的订单？**
   两个口径都存在（见 [P1-3](#p1-3-日汇总与实时聚合的统计语义不同源--同一张团队业绩卡片会给出两个不同的数字)），
   需要产品给出唯一定义后我按 0-3 一起修。
   **怎么确认**：看 `docs/DESIGN.md` 或产品文档里"团队业绩"的定义。
6. **`CommissionLog.amountCny` 的折算基准时间**：目前用"**计提时刻**的 USD→CNY 汇率"（`currentUsdToCny()`），
   而不是订单时刻的快照。这意味着同一订单在不同时间计提会产生不同的 CNY 金额（幂等键保证了只计提一次，但"补算"与"首发"的金额可能不同）。
   是否需要改为"订单 `paidAt` 时刻的 CNY 汇率快照"（更可复现、财务更认可），需与财务确认。
   **怎么确认**：问财务是否接受"汇率损益由平台承担"；若要改，需在 `Order` 上补一个 `cnyRateSnapshot` 字段。

---

### 报告结束

- 本次审查为**只读**：未修改任何源码、配置、迁移或数据库内容（SQL 全部为 `SELECT`）。
- 唯一新增文件：`docs/DISTRIBUTION_COMMERCIAL_AUDIT.md`（本报告）。
- 与 `docs/DISTRIBUTION_COMMERCIAL_READINESS.md`（2026-09-21 自评版）的差异：
  ① 该文把"缺表/db push"当成结论，本次核验为**迁移齐全**，真实风险是**历史 drift 导致的启动失败**；
  ② 该文未发现 **P0-1（等级规则撞键）**、**P1-1（冲正分母口径）**、**P1-2（汇总币种折算，已实测 6.7 倍偏差）**、
  **P1-3（汇总/实时口径不同源）**、**P1-4（绑定死锁）**、**P1-5（解绑不重建闭包）**、**P1-6（禁用不止付）**、
  **P1-7（冲正非原子）**、**P1-8（对账每分钟全量跑）**；③ 该文的 P0-2（拒付）/P0-3（个税）本次复核**依然成立**。

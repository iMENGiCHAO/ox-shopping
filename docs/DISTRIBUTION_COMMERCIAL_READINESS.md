# 分销系统 · 商用就绪差距分析

> 审计日期：2026-09-21　范围：`src/lib/distribution/*`、`src/server/services/distribution/*`、
> `src/app/api/{admin/,}distribution/*`、`src/app/(distribution)/*`、Prisma 分销 8 张表。
> 结论先行：**架构与资金主链路质量很高，可以进灰度；但有 5 个 P0 必须在真实收款前解决。**

---

## 一、结论

| 维度 | 评价 | 说明 |
| --- | --- | --- |
| 领域建模 | **优** | 闭包表关系链、客户绑定唯一约束、佣金幂等键、受益人快照、财务表 `SetNull` 不级联删 |
| 资金主链路 | **良** | 计提/结算/冲正幂等且并发安全；**但提现申请不是原子的**（P0-1） |
| 隔离与可运维性 | **优** | `bridge.ts` 单接口面 + 全异常吞掉 + `DISTRIBUTION_ENABLED` 开关 + 5 分钟对账兜底 |
| 权限与审计 | **良** | 全部 admin API 走 `requireAdmin()`；关键动作写 `audit()`；**缺细粒度角色**（P2） |
| 合规 | **需补** | 有"三级上限"默认值，但可配到 10 级；无个税代扣、无 KYC 证件、无入驻审核 |
| 运营工具 | **中** | 后台 10 个视图 + CSV 导出齐全；缺额度风控、缺结算单/发票、缺告警 |

**一句话**：这不是"能不能跑"的问题，是"钱出去之前有没有兜住"的问题。

---

## 二、已经做对的（不要动）

这些是审计中确认过的、有明确设计意图的实现，改之前先读注释：

1. **闭包表关系链**（`DistributionRelation`）—— 逐级分佣一次索引查询拿到全部上级，
   避免 `path LIKE '%/id/%'` 的全表扫。
2. **`DistributorCustomerBind.customerId @unique`** —— "不可抢绑"是**数据库级**保证，
   不是应用层判重（应用层会被并发穿透）。
3. **`CommissionLog @@unique([orderId, toUserId, level])` + `createMany({skipDuplicates})`**
   —— 重复回调/并发补算不会重复计佣（`commission.service.ts:173`）。
4. **结算用「条件更新认领」**（`updateMany where status=PENDING`）—— 并发下同一笔只入账一次，
   且入账在 `$transaction` 内（`commission.service.ts:208-237`）。
5. **受益人快照 + `toUserId` 可空** —— 用户注销后账本仍在，能对账、能追溯。
6. **部分退款按比例增量冲正**（`reversedAmount`/`reversedCny`），不是一刀切全额冲正。
7. **`GLOBAL` 规则用空串而非 NULL**（`rules/route.ts:20`）—— 因为 PostgreSQL 唯一索引里
   NULL 互不相等，用 NULL 会让"同层级可插任意多条全局规则"，佣金比例变成随机。
8. **5 分钟调度兜底**（`scheduler.ts:216-220`）：补归属、补计佣、补冲正、到期结算、日汇总。
   钩子只是"加速器"，正确性由对账保证 —— 这个分工是对的。
9. **`bridge.ts` 三条铁律**：商城只 import 这一个文件；分销任何异常都不影响下单/支付/发货/退款；
   开关一关行为逐字节回到接入前。

---

## 三、P0 —— 真实收款前必须解决

### P0-1　提现申请「扣款」与「建单」不在同一事务 ⚠️ → ✅ 已修（2026-09-21）

`account.service.ts` 原先：

```ts
// 1) 原子扣余额（条件更新，正确）
const claimed = await prisma.distributorAccount.updateMany({
  where: { userId, balance: { gte: amount } },
  data: { balance: { decrement: amount }, frozen: { increment: amount } },
});
if (claimed.count === 0) throw badRequest("可提现余额不足");

// 2) 再建提现单（另一个独立语句）← 中间失败就扣钱无单
const record = await prisma.withdrawRecord.create({ data: { ... } });
```

**风险**：两步之间任何失败（DB 抖动、连接断开、进程被杀）⇒ **余额已扣、冻结已加，但没有提现单**。

**已改为**：两步包进同一个 `prisma.$transaction`，余额不足时抛错整体回滚；
并把并发撞车（部分唯一索引 P2002）翻译成与前置检查同一句提示。

---

### P0-2　没有拒付 / 争议（chargeback）处理

全仓检索 `dispute` / `chargeback` **零命中**。

**风险**：客户发起拒付 → 网关把钱扣回平台 → 但佣金仍是 `PENDING`/`SETTLED`，
到持有期结束照常进可提现余额 → **平台在"没收到钱"的订单上付了佣金**。
（退款有 `onOrderRefunded` 覆盖 ✓，拒付没有。）

**修法**：接支付网关的争议事件（Stripe `charge.dispute.created` / `charge.dispute.closed`），
复用现成的 `syncOrderReversal(orderId, note)` 触发冲正；争议胜诉后再决定是否回滚。

---

### P0-3　个税代扣缺失

`WithdrawRecord` 只有 `amount`（毛额），没有 `netAmount` / `feeAmount` / `taxAmount` 字段。

**风险**：分销佣金在国内属"劳务报酬"，平台作为扣缴义务人需代扣代缴个税；
按毛额打款会让平台承担税务风险（补税 + 滞纳金）。

**修法**：加三个字段（毛额/税/实付）+ 一条可配的税率口径（如"每次≤800 免税，超出按 20% 预扣"），
提现审核页展示"实付金额"，`payNote` 旁边留完税凭证号。

---

### P0-4　分销层级上限可配到 10 级 → ✅ 已修（2026-09-21）

原实现：`maxCommissionLevels` 默认 **3**（注释写明是"合规口径"）✓，
但校验上限允许到 10 —— 默认值挡不住一次误操作（后台把 3 改成 10 就直接生效）。

**已改为**：服务端 `clampCommissionLevels()` 每次读配置都夹一次 ——
`>3` 一律夹回 `COMPLIANCE_MAX_LEVELS = 3` 并打 warn 日志，
要合法放开必须显式设置 `DISTRIBUTION_ALLOW_DEEP_LEVELS=true`。
后台表单加了醒目提示（否则运营会以为"我配了 5 级怎么只返 3 级"是 bug）。

---

### P0-5　提现无频率 / 额度风控 → ✅ 已修（2026-09-21）

原配置项只有 `minWithdrawAmount`。**已新增三项**（`DistributionConfig` + 校验 + 后台表单）：

| 配置 | 默认 | 作用 |
| --- | --- | --- |
| `dailyWithdrawLimit` | 5000 | 单日累计上限（0 = 不限） |
| `monthlyWithdrawLimit` | 50000 | 单月累计上限（0 = 不限） |
| `withdrawCooldownHours` | 0 | 两次提现最小间隔（0 = 无冷却） |

口径：只统计 `PENDING / APPROVED / PAID`（**被驳回的不占额度**，钱没动）。
在 `applyWithdraw` 里于「在途检查」之前校验 —— 超额/冷却期是更硬的拒绝理由，优先提示。

---

## 四、P1 —— 商业化必备（首月内）

### P1-1　提现并发仍有窄窗口 → ✅ 已修（2026-09-21）

in-flight 检查是 `count({ userId, status in [PENDING, APPROVED] }) > 0`，
与后面的原子扣减**不在同一事务**，两个并发请求可能都通过检查 ⇒ 生成两笔在途提现。
（余额不会扣成负数 ✓，但会出现两笔申请。）

**已加部分唯一索引**（migration `20260921120000_withdraw_one_inflight_per_user`）：

```sql
CREATE UNIQUE INDEX "withdraw_records_one_inflight_per_user"
  ON "withdraw_records" ("userId")
  WHERE "status" IN ('PENDING', 'APPROVED');
```

建索引前已核对线上「同一 userId 的在途单 > 1」的记录数为 **0**（18 张单据全部唯一），
故可直接创建。应用层撞车（Prisma P2002）已翻译成与前置检查同一句提示。

> ⚠️ Prisma schema 无法表达部分唯一索引 ⇒ 这条索引**只存在于迁移里**，
> 改 schema 时别把它删掉。

### P1-2　分销商无入驻审核

注册即成为分销商（`onUserRegistered` → 绑定，`termsAcceptedAt` 只是条款确认时间），
后台没有"审核通过/拒绝/冻结"动作，只有调等级。

**修法**：加 `status`（ACTIVE/SUSPENDED/PENDING_REVIEW）+ 后台审核动作 +
`DISTRIBUTOR_REQUIRE_APPROVAL` 开关（默认关，合规收紧时打开）。

### P1-3　KYC 只有姓名 + 收款方式

`payeeName` / `payeeMethod` 足够"线下打款能核到人"，但不够"可追溯的责任主体"。
文档里已注明"一期不接自动代付（需主体资质 + KYC + 代扣个税）"—— 属已知取舍。

**修法**：打款前上传身份证/对公账户凭证（存对象存储 + 只在审核页可看），
字段加密（项目已有 `channel-crypto-core` 的加密工具可复用）。

### P1-4　缺结算单 / 对账单产出

提现只有 `payNote`（线下流水号）。分销商没有可下载的"本期佣金明细 + 完税"凭证。

**修法**：按"月 × 分销商"生成结算单（PDF/CSV），后台与分销中心都能下载。

### P1-5　对账差异没有告警 / 阻断

`verifyAccountConsistency({ apply })` 能查出账户与流水不一致 ✓，但只返回结果，
没有"差异 > 阈值就告警 + 冻结该用户提现"的动作。

**修法**：把对账差异写进一个 `distribution_alerts` 表（或复用通知中心），
后台总览页顶部显示"待处理告警 N 条"，差异用户提现时直接拒绝并提示联系客服。

---

## 五、P2 —— 体验与扩展

| 项 | 现状 | 建议 |
| --- | --- | --- |
| 管理员角色 | 只有 `requireAdmin`（全权限） | 财务角色只能看/审提现，不能改规则 |
| 汇率口径 | 佣金按订单汇率快照折 CNY ✓ | 在文档里写明"汇率损益由平台承担"，避免结算争议 |
| 通知渠道 | 站内 + 邮件 | 提现到账/被驳回补短信或企业微信 |
| 报表 | CSV 导出 ✓ | 加"上月对账摘要"定时邮件给财务 |
| 反作弊 | 自购识别 + 风控视图 ✓ | 加"同 IP/同设备批量注册"聚类视图 |
| 提现手续费 | 无 | 若要收，需在 `WithdrawRecord` 加 `feeAmount` |

---

## 六、可执行清单（建议按此顺序）

```
✅ P0-1  提现申请包进 $transaction                       已完成
✅ P0-4  层级上限硬限 3（+ 环境变量放开 + 后台提示）        已完成
✅ P0-5  提现日/月上限 + 冷却期（默认 5000 / 50000 / 0）    已完成
✅ P1-1  提现部分唯一索引（原生 SQL 迁移，已核对 0 冲突）    已完成
☐ P0-2  接拒付事件 → 复用 syncOrderReversal              ~半天
☐ P0-3  WithdrawRecord 加 税/费/实付 三字段 + 代扣口径    ~1 天
☐ P1-2  分销商审核状态机 + 开关                           ~1 天
☐ P1-3  KYC 证件上传 + 字段加密                           ~1 天
☐ P1-4  月度结算单产出                                    ~1 天
☐ P1-5  对账差异告警 + 提现阻断                           ~半天
```

**灰度建议**：已完成 4 项（含全部"钱凭空消失/提空/超红线"类）⇒ 可开放**小额**真实提现
（如单笔上限 500 元），观察 2 周对账零差异后再放开额度。
P0-2 / P0-3 完成前不要放大额提现（拒付与税务两个口子还在）。

---

## 七、附：本次审计覆盖到的证据

- 数据模型：`prisma/schema.prisma` L749–1008（8 张表 + 2 个枚举）
- 计佣：`commission.service.ts:77-194`（幂等插入）、`200-237`（事务化结算）
- 提现：`account.service.ts:156-244`（申请，**非原子**）、`252-320`（审核，已用事务）
- 隔离：`bridge.ts` 全文（6 个钩子 + 2 个调度任务）
- 调度：`scheduler.ts:213-220`（5 分钟一轮）
- 权限：`src/app/api/admin/distribution/**` 全部 `requireAdmin()`
- 配置：`contract.ts:68-113`（9 项 + 默认值，默认值即推荐合规口径）

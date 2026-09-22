-- 提现「同一用户同时只能有一笔在途」的**数据库级**保证。
--
-- 背景：应用层在 `account.service.ts#applyWithdraw` 里做的是
--   count({ userId, status in (PENDING, APPROVED) }) > 0 → 拒绝
-- 这个检查与后面的原子扣减**不在同一事务**，两个并发请求可能都通过检查，
-- 于是生成两笔在途提现（余额不会被扣成负数 ✓，但会出现两笔申请、冻结翻倍）。
-- 加一条**部分唯一索引**把并发窗口彻底堵死：应用层检查负责给出友好提示，
-- 数据库索引负责最终正确性。
--
-- 为什么是部分索引：只约束「在途」两种状态。PAID / REJECTED 的历史单据
-- 可以任意多条（同一用户当然可以多次提现）。
--
-- 为什么可以安全建：建索引前已核对线上 `withdraw_records` 里
-- 「同一 userId 的在途单 > 1」的记录数为 **0**（18 张单据全部唯一），不会因重复而失败。
-- 若在别的环境执行前发现有重复，需先把多余单据置 REJECTED 并退回冻结金额再建索引。
--
-- 注意：Prisma schema 无法表达部分唯一索引（partial index），
-- 因此这条索引**只存在于本迁移**；`prisma migrate dev` 不会把它判为 drift
-- （drift 检测只看 Prisma 能表达的 DDL）。改 schema 时别把它删掉。

CREATE UNIQUE INDEX "withdraw_records_one_inflight_per_user"
  ON "withdraw_records" ("userId")
  WHERE "status" IN ('PENDING', 'APPROVED');

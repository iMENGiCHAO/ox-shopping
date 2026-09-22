-- 迁移无法表达、但**必须存在**的原始 DDL（部分唯一索引）。
--
-- 为什么单独一个文件：`prisma db push` 会把「schema 里表达不了」的索引**删掉**
-- （它把库同步成 schema 的样子）。而测试库与 CI 的 e2e 作业都跑 `db push`，
-- 于是 `withdraw_records_one_inflight_per_user`（一用户同时只能有一笔在途提现，
-- 见迁移 20260921120000）会在每次测试初始化时静默消失 —— 并发提现保护被悄悄摘掉，
-- 而所有测试仍然全绿（P1-9）。
--
-- 用法（幂等，db push 之后执行一次即可）：
--   npx prisma db execute --file prisma/sql/raw-indexes.sql --schema prisma/schema.prisma
-- 调用点：tests/helpers/global-setup.ts（测试初始化）、.github/workflows/ci.yml（e2e 作业）。

-- 提现并发保护：同一用户同时最多一笔 PENDING/APPROVED 提现
CREATE UNIQUE INDEX IF NOT EXISTS "withdraw_records_one_inflight_per_user"
  ON "withdraw_records" ("userId")
  WHERE "status" IN ('PENDING', 'APPROVED');

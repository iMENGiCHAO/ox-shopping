-- 测试库专用：清空所有业务数据（保留 _prisma_migrations），
-- 让每轮集成测试都从确定的数据规模开始。
--
-- 为什么必须（2026-09-23 实测）：
--   集成测试此前从不清理数据，多轮累积到 25148 用户 / 1700 订单 / 1441 归属后，
--   cron 整轮任务（`runScheduledJobs` 在**单个事务**里跑完：超时订单取消 →
--   清理 → **分销对账** → **团队业绩日汇总**）会对全表聚合，
--   总耗时超过 vitest 的 60s 单测超时 —— 表现为「与本次改动毫无关系的
--   cron 用例突然失败」，极难定位。清库后数据量恒定，测试恢复确定。
--
-- ⚠️ 安全：本脚本**只允许**在库名以 `_test` 结尾时执行（下面的断言），
--   防止有人漏配 .env.test 时把开发库/生产库清空。global-setup 侧还有一层
--   URL 检查（见 tests/helpers/global-setup.ts）。

DO $$
BEGIN
  IF current_database() NOT LIKE '%\_test' THEN
    RAISE EXCEPTION '拒绝清空非测试库（当前库：%）——本脚本仅用于 *_test 测试库', current_database();
  END IF;
END $$;

DO $$
DECLARE
  stmt text;
BEGIN
  SELECT string_agg(format('%I', tablename), ', ')
    INTO stmt
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename NOT LIKE '\_prisma%';

  IF stmt IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || stmt || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;

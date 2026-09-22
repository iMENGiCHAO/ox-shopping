-- `prisma db push` **之前**执行的数据归一（幂等）。
--
-- 为什么需要：`commission_rules.tierLevel` 已从「可空（NULL=通用）」改为
-- 「非空 + 默认 0（0=通用）」，唯一键也随之扩为四元组。用 `migrate deploy` 的库由迁移
-- （20260921150000_commission_rule_tier_unique）负责归一；但**测试库与 CI 走 db push**，
-- 库里还留着 NULL，db push 会直接拒绝（"Made the column tierLevel ... NOT NULL"
-- 且无法执行），随后 seed 也不会跑 —— 整批集成测试连锁失败。
--
-- 用法：
--   npx prisma db execute --file prisma/sql/pre-push-normalize.sql   # db push 之前
--   npx prisma db push ...
--   npx prisma db execute --file prisma/sql/raw-indexes.sql         # db push 之后
-- 调用点：tests/helpers/global-setup.ts、.github/workflows/ci.yml

DO $$
BEGIN
  -- 表还不存在（全新库）时整段跳过
  IF to_regclass('public.commission_rules') IS NULL THEN
    RETURN;
  END IF;

  -- 1) tierLevel: NULL → 0（0 = 通用规则）
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'commission_rules' AND column_name = 'tierLevel' AND is_nullable = 'YES'
  ) THEN
    EXECUTE 'UPDATE commission_rules SET "tierLevel" = 0 WHERE "tierLevel" IS NULL';
  END IF;

  -- 2) scopeId: NULL → ''（NULL 不进唯一约束，会与空串行重复）
  EXECUTE 'UPDATE commission_rules SET "scopeId" = '''' WHERE "scopeId" IS NULL';

  -- 3) 同 (scopeType, scopeId, level, tierLevel) 去重，仅留 updatedAt 最新
  EXECUTE $del$
    DELETE FROM commission_rules c
    USING commission_rules d
    WHERE c."id" <> d."id"
      AND c."scopeType" = d."scopeType"
      AND c."scopeId" = d."scopeId"
      AND c."level" = d."level"
      AND c."tierLevel" = d."tierLevel"
      AND (c."updatedAt" < d."updatedAt"
           OR (c."updatedAt" = d."updatedAt" AND c."id" < d."id"))
  $del$;
END $$;

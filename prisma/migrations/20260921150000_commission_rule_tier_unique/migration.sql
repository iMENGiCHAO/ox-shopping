-- P0-1 修复：等级佣金规则唯一键不含 tierLevel，导致「等级专用规则」与「通用规则」互相覆盖。
--
-- 现象（商业交付审查 docs/DISTRIBUTION_COMMERCIAL_AUDIT.md P0-1）：
--   `commission_rules` 原唯一键 = (scopeType, scopeId, level)，不含 tierLevel。
--   后台为「VIP 2 级」配一条 20% 时，会 upsert **覆盖**掉同 (GLOBAL, level=2) 的通用规则；
--   覆盖后该行的 tierLevel=VIP，而 resolveRule 对非 VIP 分销商只认通用规则（tierLevel=0）
--   → 返回 null → **该层级佣金静默归零**（既不报错也不记账，只有对账时才发现少钱）。
--   默认已播种 level 1..5 的通用规则，所以后台只要动一次等级比例就必然踩中。
--
-- 修复：tierLevel 从「可空（NULL=通用）」改为「非空，0=通用」，并把唯一键扩为四元组。
--   为什么不能用可空 + 四元组唯一键：PostgreSQL 唯一索引中 NULL 互不相等 ——
--   通用规则可重复插入，唯一约束形同虚设。
--
-- 迁移内含数据归一与去重：老库可能存在 (scopeId NULL) 与 (scopeId '') 两份同层规则
-- （早期播种口径不一致），归一后会在新唯一键上冲突，必须先按 updatedAt 保留最新一条。

-- 1) tierLevel: NULL → 0（0 = 通用规则）
UPDATE "commission_rules" SET "tierLevel" = 0 WHERE "tierLevel" IS NULL;

-- 2) scopeId: NULL → ''（与后台写入口径一致；NULL 不进唯一约束）
UPDATE "commission_rules" SET "scopeId" = '' WHERE "scopeId" IS NULL;

-- 3) 去重：同 (scopeType, scopeId, level, tierLevel) 仅保留 updatedAt 最新（并列时保留 id 较小者，保证确定性）
DELETE FROM "commission_rules" c
USING "commission_rules" d
WHERE c."id" <> d."id"
  AND c."scopeType" = d."scopeType"
  AND c."scopeId" = d."scopeId"
  AND c."level" = d."level"
  AND c."tierLevel" = d."tierLevel"
  AND (
    c."updatedAt" < d."updatedAt"
    OR (c."updatedAt" = d."updatedAt" AND c."id" < d."id")
  );

-- 4) 列约束：非空 + 默认 0
ALTER TABLE "commission_rules" ALTER COLUMN "tierLevel" SET DEFAULT 0;
ALTER TABLE "commission_rules" ALTER COLUMN "tierLevel" SET NOT NULL;

-- 5) 唯一键替换为四元组
DROP INDEX IF EXISTS "commission_rules_scopeType_scopeId_level_key";
CREATE UNIQUE INDEX "commission_rules_scopeType_scopeId_level_tierLevel_key"
  ON "commission_rules" ("scopeType", "scopeId", "level", "tierLevel");

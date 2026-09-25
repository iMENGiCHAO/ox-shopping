-- 多币种分销与商业化改造（2026-09-24）：
--   1. 币种配置表（后台可增删支持币种，enabled/payable 两级开关）
--   2. 分销账户结算币种（settlementCurrency，账户级，默认 CNY 兼容历史）
--   3. 佣金流水按结算币种记账（amountSettle/reversedSettle/settleCurrency）
--   4. 提现单币种快照
--   5. 订单行成本价快照（分销「利润分成」模式的计佣基数）

-- AlterTable
ALTER TABLE "commission_logs" ADD COLUMN     "amountSettle" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reversedSettle" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "settleCurrency" TEXT NOT NULL DEFAULT 'CNY';

-- AlterTable
ALTER TABLE "distributor_accounts" ADD COLUMN     "settlementCurrency" TEXT NOT NULL DEFAULT 'CNY';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "costPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "withdraw_records" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CNY';

-- CreateTable
CREATE TABLE "currency_configs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "flagCode" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "payable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "currency_configs_code_key" ON "currency_configs"("code");

-- ── 存量数据回填（与列默认值配套，保证新旧口径无缝衔接）─────────────────
-- 历史佣金流水的结算币种恒为 CNY：amountSettle/reversedSettle 与 CNY 列等值
UPDATE "commission_logs" SET "amountSettle" = "amountCny";
UPDATE "commission_logs" SET "reversedSettle" = "reversedCny";

-- 历史订单行成本价回填：商品仍关联的行取当前成本价快照
--（商品已删除的行保持 NULL —— 计佣侧对 NULL 成本的口径是「跳过利润计佣」）
UPDATE "order_items" oi
SET "costPrice" = p."costPrice"
FROM "products" p
WHERE oi."productId" = p."id" AND p."costPrice" IS NOT NULL;

-- AlterTable
ALTER TABLE "commission_rules" ADD COLUMN     "tierLevel" INTEGER;

-- AlterTable
ALTER TABLE "distributor_accounts" ADD COLUMN     "tier" INTEGER NOT NULL DEFAULT 0;


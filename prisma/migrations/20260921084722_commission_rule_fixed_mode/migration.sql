-- AlterTable
ALTER TABLE "commission_rules" ADD COLUMN     "fixedAmount" DECIMAL(10,2),
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'RATIO',
ALTER COLUMN "ratio" SET DEFAULT 0;


-- DropForeignKey
ALTER TABLE "commission_logs" DROP CONSTRAINT "commission_logs_toUserId_fkey";

-- DropForeignKey
ALTER TABLE "distributor_customer_binds" DROP CONSTRAINT "distributor_customer_binds_customerId_fkey";

-- DropForeignKey
ALTER TABLE "distributor_customer_binds" DROP CONSTRAINT "distributor_customer_binds_distributorId_fkey";

-- DropForeignKey
ALTER TABLE "withdraw_records" DROP CONSTRAINT "withdraw_records_userId_fkey";

-- AlterTable
ALTER TABLE "commission_logs" ADD COLUMN     "reversedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reversedCny" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "toUserEmail" TEXT,
ADD COLUMN     "toUserName" TEXT,
ALTER COLUMN "toUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "distributor_customer_binds" ALTER COLUMN "distributorId" DROP NOT NULL,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "withdraw_records" ADD COLUMN     "payeeMethod" TEXT,
ADD COLUMN     "payeeName" TEXT,
ADD COLUMN     "userEmail" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "distributor_customer_binds" ADD CONSTRAINT "distributor_customer_binds_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_customer_binds" ADD CONSTRAINT "distributor_customer_binds_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_logs" ADD CONSTRAINT "commission_logs_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdraw_records" ADD CONSTRAINT "withdraw_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


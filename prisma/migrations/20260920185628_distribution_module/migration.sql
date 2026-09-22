-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WithdrawStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "distLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "distPath" TEXT,
ADD COLUMN     "firstPromoteAt" TIMESTAMP(3),
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "isDistributor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "distribution_relations" (
    "ancestorId" TEXT NOT NULL,
    "descendantId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_relations_pkey" PRIMARY KEY ("ancestorId","descendantId")
);

-- CreateTable
CREATE TABLE "distributor_customer_binds" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bindType" TEXT NOT NULL DEFAULT 'link',
    "source" TEXT,
    "bindTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "distributor_customer_binds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT,
    "level" INTEGER NOT NULL,
    "ratio" DECIMAL(5,2) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "effectiveAt" TIMESTAMP(3),
    "expireAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "ratio" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "amountCny" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "baseAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "commission_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_accounts" (
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "frozen" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCommission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_accounts_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "withdraw_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "WithdrawStatus" NOT NULL DEFAULT 'PENDING',
    "accountInfo" TEXT,
    "remark" TEXT,
    "auditNote" TEXT,
    "payNote" TEXT,
    "auditedById" TEXT,
    "auditedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdraw_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_attributions" (
    "orderId" TEXT NOT NULL,
    "distributorId" TEXT,
    "relationPathSnapshot" JSONB,
    "bindId" TEXT,
    "natural" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_attributions_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX "distribution_relations_descendantId_depth_idx" ON "distribution_relations"("descendantId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_customer_binds_customerId_key" ON "distributor_customer_binds"("customerId");

-- CreateIndex
CREATE INDEX "distributor_customer_binds_distributorId_status_idx" ON "distributor_customer_binds"("distributorId", "status");

-- CreateIndex
CREATE INDEX "distributor_customer_binds_status_bindTime_idx" ON "distributor_customer_binds"("status", "bindTime");

-- CreateIndex
CREATE INDEX "commission_rules_enabled_level_idx" ON "commission_rules"("enabled", "level");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_scopeType_scopeId_level_key" ON "commission_rules"("scopeType", "scopeId", "level");

-- CreateIndex
CREATE INDEX "commission_logs_orderId_idx" ON "commission_logs"("orderId");

-- CreateIndex
CREATE INDEX "commission_logs_toUserId_status_createdAt_idx" ON "commission_logs"("toUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "commission_logs_status_createdAt_idx" ON "commission_logs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "commission_logs_orderId_toUserId_level_key" ON "commission_logs"("orderId", "toUserId", "level");

-- CreateIndex
CREATE INDEX "distributor_accounts_balance_idx" ON "distributor_accounts"("balance");

-- CreateIndex
CREATE INDEX "withdraw_records_userId_createdAt_idx" ON "withdraw_records"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "withdraw_records_status_createdAt_idx" ON "withdraw_records"("status", "createdAt");

-- CreateIndex
CREATE INDEX "order_attributions_distributorId_createdAt_idx" ON "order_attributions"("distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "order_attributions_natural_createdAt_idx" ON "order_attributions"("natural", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_isDistributor_idx" ON "users"("isDistributor");

-- CreateIndex
CREATE INDEX "users_invitedById_idx" ON "users"("invitedById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_relations" ADD CONSTRAINT "distribution_relations_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_relations" ADD CONSTRAINT "distribution_relations_descendantId_fkey" FOREIGN KEY ("descendantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_customer_binds" ADD CONSTRAINT "distributor_customer_binds_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_customer_binds" ADD CONSTRAINT "distributor_customer_binds_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_logs" ADD CONSTRAINT "commission_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_logs" ADD CONSTRAINT "commission_logs_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_logs" ADD CONSTRAINT "commission_logs_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_accounts" ADD CONSTRAINT "distributor_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdraw_records" ADD CONSTRAINT "withdraw_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdraw_records" ADD CONSTRAINT "withdraw_records_auditedById_fkey" FOREIGN KEY ("auditedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_attributions" ADD CONSTRAINT "order_attributions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


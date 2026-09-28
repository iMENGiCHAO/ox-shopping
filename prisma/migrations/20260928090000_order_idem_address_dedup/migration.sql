-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "contentHash" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "addresses_userId_contentHash_key" ON "addresses"("userId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");


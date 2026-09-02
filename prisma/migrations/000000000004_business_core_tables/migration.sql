-- AlterTable
ALTER TABLE "favorites" ADD COLUMN     "lang" TEXT;

-- AlterTable
ALTER TABLE "notify_me" ADD COLUMN     "lang" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "isCashOnDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isUnread" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shippingMethodId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "presaleNoteEn" TEXT,
ADD COLUMN     "presaleNoteZh" TEXT;

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "descriptionEn" TEXT,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freeOver" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isCashOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "etaZh" TEXT,
    "etaEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "body" TEXT NOT NULL,
    "bodyEn" TEXT,
    "link" TEXT,
    "meta" JSONB,
    "isUnread" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "notifiedPrice" DECIMAL(10,2),
    "lang" TEXT,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_methods_code_key" ON "shipping_methods"("code");

-- CreateIndex
CREATE INDEX "shipping_methods_isActive_sortOrder_idx" ON "shipping_methods"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "notifications_userId_isUnread_idx" ON "notifications"("userId", "isUnread");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "price_alerts_favoriteId_key" ON "price_alerts"("favoriteId");

-- CreateIndex
CREATE INDEX "price_alerts_productId_unsubscribed_idx" ON "price_alerts"("productId", "unsubscribed");

-- CreateIndex
CREATE INDEX "price_alerts_userId_idx" ON "price_alerts"("userId");

-- CreateIndex
CREATE INDEX "orders_assigneeId_idx" ON "orders"("assigneeId");

-- CreateIndex
CREATE INDEX "orders_isUnread_status_idx" ON "orders"("isUnread", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "favorites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


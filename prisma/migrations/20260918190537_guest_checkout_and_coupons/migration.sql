-- 游客结账 + 折扣码（优惠券）
--
-- 背景：此前 20260910042551_drop_reviews_coupons 以「shop.x.com 原站没有的冗余功能」
-- 为由删掉了 coupons / coupon_redemptions。经复核原站结账页截图，结账页右栏确实有
-- 「Discount code + Apply」入口（商品评价 Review 则确实没有，故不恢复）。
-- 同时原站结账页允许不登录直接下单（Contact 区为 Email + Sign in 链接），
-- 故放开 Order.userId 的 NOT NULL 约束并引入游客联系邮箱与订单查询令牌。
--
-- 兼容性：
--  - Order.userId / Refund.userId 改为可空；外键由 RESTRICT 改为 ON DELETE SET NULL，
--    用户注销后历史订单仍保留（金额与地址快照不丢）。
--  - 新增列均可空或带默认值，既有订单数据无需回填。
--  - coupons 表为全新建表（旧表已 DROP），旧的 CouponType 枚举亦已不存在。

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED', 'FREE_SHIPPING');

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_userId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_userId_fkey";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "minSpend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "maxDiscount" DECIMAL(10,2),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "titleEn" TEXT,
    "description" TEXT,
    "descriptionEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "orderId" TEXT NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_isActive_startsAt_endsAt_idx" ON "coupons"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "coupons_isPublic_isActive_idx" ON "coupons"("isPublic", "isActive");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_userId_idx" ON "coupon_redemptions"("couponId", "userId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_email_idx" ON "coupon_redemptions"("couponId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_couponId_orderId_key" ON "coupon_redemptions"("couponId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_accessToken_key" ON "orders"("accessToken");

-- CreateIndex
CREATE INDEX "orders_couponId_idx" ON "orders"("couponId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


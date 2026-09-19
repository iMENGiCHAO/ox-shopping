/*
  Warnings:

  - You are about to drop the `favorites` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `price_alerts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_productId_fkey";

-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_userId_fkey";

-- DropForeignKey
ALTER TABLE "price_alerts" DROP CONSTRAINT "price_alerts_favoriteId_fkey";

-- DropForeignKey
ALTER TABLE "price_alerts" DROP CONSTRAINT "price_alerts_productId_fkey";

-- DropForeignKey
ALTER TABLE "price_alerts" DROP CONSTRAINT "price_alerts_userId_fkey";

-- AlterTable（补齐 orders.exchangeRate 列 + 币种默认值对齐 schema，历史漂移遗留）
ALTER TABLE "orders" ADD COLUMN     "exchangeRate" DECIMAL(12,6) NOT NULL DEFAULT 1,
ALTER COLUMN "currency" SET DEFAULT 'USD';

-- DropTable
DROP TABLE "favorites";

-- DropTable
DROP TABLE "price_alerts";

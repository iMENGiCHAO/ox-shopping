-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_productId_fkey";

-- DropForeignKey
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_userId_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_orderItemId_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_productId_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_userId_fkey";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "ratingAvg",
DROP COLUMN "ratingCount";

-- DropTable
DROP TABLE "favorites";

-- DropTable
DROP TABLE "reviews";

-- DropEnum
DROP TYPE "ReviewStatus";


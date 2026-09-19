-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3);

-- DropEnum
DROP TYPE "CouponType";

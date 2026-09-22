-- CreateTable
CREATE TABLE "distribution_daily_stats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "salesCny" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionCny" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "teamSize" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribution_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distribution_daily_stats_day_idx" ON "distribution_daily_stats"("day");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_daily_stats_userId_day_key" ON "distribution_daily_stats"("userId", "day");

-- AddForeignKey
ALTER TABLE "distribution_daily_stats" ADD CONSTRAINT "distribution_daily_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


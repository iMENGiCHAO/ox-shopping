-- CreateTable
CREATE TABLE "rebind_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromDistributorId" TEXT,
    "toDistributorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedNote" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "rebind_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rebind_requests_status_createdAt_idx" ON "rebind_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "rebind_requests_customerId_idx" ON "rebind_requests"("customerId");

-- AddForeignKey
ALTER TABLE "rebind_requests" ADD CONSTRAINT "rebind_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebind_requests" ADD CONSTRAINT "rebind_requests_toDistributorId_fkey" FOREIGN KEY ("toDistributorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebind_requests" ADD CONSTRAINT "rebind_requests_fromDistributorId_fkey" FOREIGN KEY ("fromDistributorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebind_requests" ADD CONSTRAINT "rebind_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Refund reliability: pending/failed are explicit, outbox + stable provider idempotency key.
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TYPE "RefundOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED');

ALTER TABLE "refunds"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "processedAt" TIMESTAMP(3);

UPDATE "refunds" SET "idempotencyKey" = 'legacy_refund_' || id WHERE "idempotencyKey" IS NULL;
ALTER TABLE "refunds" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "refunds_idempotencyKey_key" ON "refunds"("idempotencyKey");

CREATE TABLE "refund_outbox" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "status" "RefundOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "uniqueKey" TEXT NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refund_outbox_refundId_key" ON "refund_outbox"("refundId");
CREATE UNIQUE INDEX "refund_outbox_uniqueKey_key" ON "refund_outbox"("uniqueKey");
CREATE INDEX "refund_outbox_status_nextAttemptAt_idx" ON "refund_outbox"("status", "nextAttemptAt");
ALTER TABLE "refund_outbox" ADD CONSTRAINT "refund_outbox_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only an already-approved refund is executable work; completed refunds are closed history.
-- REQUESTED (not approved) and REJECTED must never be picked up by a worker.
INSERT INTO "refund_outbox" ("id", "refundId", "status", "attempts", "uniqueKey", "nextAttemptAt", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text || r.id), r.id,
       CASE WHEN r.status = 'REFUNDED' THEN 'COMPLETED'::"RefundOutboxStatus" ELSE 'RETRY'::"RefundOutboxStatus" END,
       0, r."idempotencyKey", CURRENT_TIMESTAMP, r."createdAt", r."updatedAt"
FROM "refunds" r
WHERE r.status IN ('APPROVED', 'REFUNDED');

ALTER TABLE "order_attributions" ADD COLUMN "ruleSnapshot" JSONB;

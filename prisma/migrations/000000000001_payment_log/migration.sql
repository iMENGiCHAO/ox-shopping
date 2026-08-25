-- 支付/退款流水日志（资金对账审计）
CREATE TABLE "payment_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "provider" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "gatewayId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_logs_orderId_idx" ON "payment_logs"("orderId");
CREATE INDEX "payment_logs_event_createdAt_idx" ON "payment_logs"("event", "createdAt");

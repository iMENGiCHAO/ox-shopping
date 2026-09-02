-- 支付反查索引：Stripe Webhook(charge.refunded 按 paymentId 反查订单)
-- 与掉单对账(按 paymentSessionId 过滤)在数据量增长后避免全表扫描。
CREATE INDEX "orders_paymentId_idx" ON "orders"("paymentId");
CREATE INDEX "orders_paymentSessionId_idx" ON "orders"("paymentSessionId");

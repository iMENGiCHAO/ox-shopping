-- 交付审计：补齐 7 个缺失的外键索引。
-- PostgreSQL 不会为外键列自动建索引 —— 这些列在 groupBy / 删除级联 / 计数查询里
-- 走全表扫（如 report.service groupBy fromUserId、物流方式删除前的 order.count）。
-- 全部为additive，可安全在有数据的库上执行。
CREATE INDEX "commission_logs_fromUserId_idx" ON "commission_logs"("fromUserId");
CREATE INDEX "password_reset_requests_handledById_idx" ON "password_reset_requests"("handledById");
CREATE INDEX "withdraw_records_auditedById_idx" ON "withdraw_records"("auditedById");
CREATE INDEX "rebind_requests_fromDistributorId_idx" ON "rebind_requests"("fromDistributorId");
CREATE INDEX "rebind_requests_toDistributorId_idx" ON "rebind_requests"("toDistributorId");
CREATE INDEX "rebind_requests_reviewedById_idx" ON "rebind_requests"("reviewedById");
CREATE INDEX "orders_shippingMethodId_idx" ON "orders"("shippingMethodId");

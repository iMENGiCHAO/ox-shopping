-- CreateIndex
CREATE INDEX "mail_outbox_updatedAt_idx" ON "mail_outbox"("updatedAt");

-- CreateIndex
CREATE INDEX "orders_isUnread_createdAt_idx" ON "orders"("isUnread", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "orders_paidAt_idx" ON "orders"("paidAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

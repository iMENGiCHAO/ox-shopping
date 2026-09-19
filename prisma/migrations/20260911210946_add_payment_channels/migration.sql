-- 支付渠道（可配置化 + 密钥加密存储）
-- config_encrypted = AES-256-GCM 加密后的配置 JSON 字符串，密钥来自环境变量 PAYMENT_CHANNEL_ENC_KEY
CREATE TABLE "payment_channels" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configEncrypted" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_channels_code_key" ON "payment_channels"("code");

-- CreateIndex
CREATE INDEX "payment_channels_enabled_sortOrder_idx" ON "payment_channels"("enabled", "sortOrder");
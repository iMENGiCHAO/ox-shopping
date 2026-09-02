import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { effectivePaymentMode, env } from "@/lib/env";

export const runtime = "nodejs";

/** GET /api/admin/payments/status — 支付/邮件/存储配置状态（只读，不暴露任何密钥） */
export const GET = apiHandler(async () => {
  await requireAdmin();
  return json({
    paymentMode: effectivePaymentMode,
    stripeConfigured: env.PAYMENT_MODE !== "mock" && env.STRIPE_SECRET_KEY.length > 0,
    currency: env.CURRENCY,
    mailProvider: env.MAIL_PROVIDER,
    storageDriver: env.STORAGE_DRIVER === "s3" ? "s3" : "local",
    s3Configured: Boolean(env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),
  });
});

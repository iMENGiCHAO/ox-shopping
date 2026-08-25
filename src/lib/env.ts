import { z } from "zod";

/**
 * 环境变量统一解析与校验。
 * 未配置的外部服务自动降级：支付→mock、邮件→console、存储→local。
 */

const booleanFromString = z
  .enum(["true", "false", "1", "0", ""])
  .transform((v) => v === "true" || v === "1")
  .default("false");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SITE_URL: z.string().url().default("http://localhost:3000"),

  // 数据库
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://ecommerce:ecommerce@localhost:5432/ecommerce?schema=public"),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_ENABLED: booleanFromString.default("true"),
  CACHE_TTL: z.coerce.number().int().positive().default(60),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(1).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(1).default("dev-refresh-secret-change-me"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604800),
  COOKIE_DOMAIN: z.string().optional(),

  // 支付
  PAYMENT_MODE: z.enum(["auto", "stripe", "mock"]).default("auto"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  CURRENCY: z.string().min(3).default("USD"),

  // 邮件
  MAIL_PROVIDER: z.enum(["resend", "smtp", "console"]).default("console"),
  MAIL_FROM: z.string().default("SpaceXAI Shop <no-reply@example.com>"),
  RESEND_API_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_SECURE: booleanFromString.default("false"),

  // 存储
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("ecommerce"),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_URL: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: booleanFromString.default("true"),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),

  // 订单
  SHIPPING_FEE: z.coerce.number().nonnegative().default(10),
  FREE_SHIPPING_THRESHOLD: z.coerce.number().nonnegative().default(99),
  TAX_RATE: z.coerce.number().min(0).max(1).default(0),
  ORDER_EXPIRE_SECONDS: z.coerce.number().int().positive().default(1800),

  // 监控
  SENTRY_DSN: z.string().optional().default(""),

  // 日志
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // 环境变量错误属于致命配置错误，直接抛出并给出修复提示
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`环境变量配置无效：\n${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/** Stripe 是否可用(密钥已配置且未强制 mock) */
export const isStripeConfigured = env.PAYMENT_MODE !== "mock" && env.STRIPE_SECRET_KEY.length > 0;

/** 实际生效的支付模式 */
export const effectivePaymentMode: "stripe" | "mock" =
  env.PAYMENT_MODE === "stripe"
    ? env.STRIPE_SECRET_KEY.length > 0
      ? "stripe"
      : "mock"
    : isStripeConfigured
      ? "stripe"
      : "mock";

/** S3 存储是否可用(显式 s3 且配置齐全) */
export const isS3Configured =
  env.STORAGE_DRIVER === "s3" &&
  env.S3_ENDPOINT.length > 0 &&
  env.S3_ACCESS_KEY_ID.length > 0 &&
  env.S3_SECRET_ACCESS_KEY.length > 0;

/** 实际生效的存储驱动 */
export const effectiveStorageDriver: "s3" | "local" = isS3Configured ? "s3" : "local";

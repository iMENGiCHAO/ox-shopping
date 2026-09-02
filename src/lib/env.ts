import "server-only";
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
  // 网络：是否位于可信反向代理之后（nginx/CDN 覆盖 X-Forwarded-For 写入客户端真实 IP）。
  // 生产默认 true：取 XFF 最后一跳（反代追加的条目可信）；直连公网部署请显式设 false。
  TRUST_PROXY: booleanFromString.default(process.env.NODE_ENV === "production" ? "true" : "false"),

  // 支付
  PAYMENT_MODE: z.enum(["auto", "stripe", "mock"]).default("auto"),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  /**
   * 基础币种（商品价格库单位 + 默认展示币种）。
   * 受 Stripe 支持范围限制的子集，CNY 在 Stripe 通道下会被拒 → 走 mock。
   * 注：用户选择其他币种时由汇率换算，Order.currency 记录实际支付币种。
   */
  CURRENCY: z
    .enum(["USD", "EUR", "GBP", "JPY", "HKD", "CNY", "AUD", "CAD", "SGD"])
    .default("USD"),

  // 邮件
  MAIL_PROVIDER: z.enum(["resend", "smtp", "console"]).default("console"),
  MAIL_FROM: z.string().default("Ox Shopping <no-reply@example.com>"),
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

  // 安全:生产环境强制校验密钥强度(本地演示可显式关闭)
  REQUIRE_STRONG_SECRETS: booleanFromString.default(
    process.env.NODE_ENV === "production" ? "true" : "false",
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // 环境变量错误属于致命配置错误，直接抛出并给出修复提示
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`环境变量配置无效：\n${issues}`);
}

export const env = parsed.data;

// ---------- 生产安全守卫：弱默认密钥直接拒绝启动 ----------
{
  const weak: string[] = [];
  const isWeakSecret = (v: string, fallback: string) =>
    v === fallback || v.length < 32 || /change[-_ ]?(me|in-prod)|^dev-/i.test(v);
  if (isWeakSecret(env.JWT_ACCESS_SECRET, "dev-access-secret-change-me")) {
    weak.push("JWT_ACCESS_SECRET");
  }
  if (isWeakSecret(env.JWT_REFRESH_SECRET, "dev-refresh-secret-change-me")) {
    weak.push("JWT_REFRESH_SECRET");
  }
  if (weak.length > 0 && env.REQUIRE_STRONG_SECRETS) {
    // 构建期(next build)仅告警——页面数据收集会导入路由模块，此时不应中断构建；
    // 运行期(next start / 容器启动)仍会走到这里并拒绝服务。
    if (process.env.NEXT_PHASE === "phase-production-build") {
      console.warn(
        `[警告] 检测到不安全的 JWT 密钥(${weak.join(", ")})。` +
          `生产部署前必须替换为 ≥32 位随机密钥，否则服务将在启动时被拒绝。`,
      );
    } else {
      throw new Error(
        `[启动失败] 生产环境(REQUIRE_STRONG_SECRETS=true)检测到不安全的 JWT 密钥：\n` +
          weak.map((k) => `  - ${k}`).join("\n") +
          `\n请设置 ≥32 位随机密钥(如 openssl rand -base64 48)。` +
          `\n本地一键演示如需跳过此检查，请显式设置 REQUIRE_STRONG_SECRETS=false。`,
      );
    }
  }
}

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

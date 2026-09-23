import "server-only";
import { z } from "zod";

/**
 * 环境变量统一解析与校验。
 * 非生产环境允许外部服务降级：支付→mock、邮件→console、存储→local；
 * 生产强配置守卫会拒绝弱密钥、mock 支付、无密码 Redis 和不完整 S3。
 */

const booleanFromString = z
  .enum(["true", "false", "1", "0", ""])
  .transform((v) => v === "true" || v === "1")
  .default("false");

/** 空字符串代表“未配置”，但一旦填写必须是绝对 http(s) URL。 */
const optionalHttpUrl = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
      message: "必须使用 http:// 或 https:// URL",
    }),
]);

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
   * 生产环境显式允许模拟支付（免费下单）。
   * 默认 false：生产 mock 模式（漏配 Stripe / PAYMENT_MODE=mock）在启动时被守卫拒绝，
   * 防止「生产环境静默免费下单」——真实收款为 0 却看不到任何错误。
   * 本地演示/测试不受影响（REQUIRE_STRONG_SECRETS=false 时守卫不生效）。
   */
  ALLOW_MOCK_PAYMENT_IN_PROD: booleanFromString.default("false"),
  /**
   * 显式豁免「生产启用无密码 Redis」的启动守卫（B2）。
   * 仅供确有内网隔离保障的特殊部署使用；默认 false（生产拒绝启动）。
   */
  ALLOW_PASSWORDLESS_REDIS_IN_PROD: booleanFromString.default("false"),
  /**
   * 支付渠道配置加密主密钥（AES-256-GCM，经 SHA-256 派生为 32 字节）。
   * 用于加密 payment_channels.config_encrypted（支付宝/微信的密钥等）。
   * 生产必须替换为随机值；更换后需重新保存各渠道配置（旧密文将无法解密）。
   */
  PAYMENT_CHANNEL_ENC_KEY: z.string().min(1).default("dev-payment-channel-enc-key-change-me"),
  /**
   * 基础币种（商品价格库单位 + 默认展示币种）。
   * 受 Stripe 支持范围限制的子集，CNY 在 Stripe 通道下会被拒 → 走 mock。
   * 注：用户选择其他币种时由汇率换算，Order.currency 记录实际支付币种。
   */
  CURRENCY: z.enum(["USD", "EUR", "GBP", "JPY", "HKD", "CNY", "AUD", "CAD", "SGD"]).default("USD"),

  // 邮件
  MAIL_PROVIDER: z.enum(["resend", "smtp", "console"]).default("console"),
  /**
   * 发件人。留空时由 `brandFallback` + `SITE_URL` 的域名拼出（见下方 `mailFrom`）。
   * 注意：不要在此写死 `no-reply@example.com` —— example.com 是 IANA 保留域，
   * 从它发信会被所有主流收件方拒收（SPF/DKIM 无从配置），生产必须显式配置。
   */
  MAIL_FROM: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_SECURE: booleanFromString.default("false"),

  /**
   * 品牌名兜底：后台「站点设置 → 站点名称」未填写时使用。
   * 这里是**全站唯一**的品牌字面量来源 —— SEO 元数据、发票、邮件、
   * PayPal 收银台、后台外壳都从这里取，改名只需改这一处（或直接设环境变量）。
   */
  SITE_NAME: z.string().optional().default(""),

  /**
   * 客服联系方式兜底：后台「站点设置」未填写时使用。
   * 客服邮箱留空则回落到 MAIL_FROM 里的发件地址 —— 避免把
   * `support@example.com` 这类占位地址带到线上（FAQ / 发票 / 隐私选择页都会引用它）。
   */
  SUPPORT_EMAIL: z.string().optional().default(""),
  SUPPORT_PHONE: z.string().optional().default(""),

  // 存储
  STORAGE_DRIVER: z.enum(["s3", "local"]).default("local"),
  S3_ENDPOINT: optionalHttpUrl.default(""),
  S3_REGION: z.string().trim().min(1).default("us-east-1"),
  S3_BUCKET: z.string().trim().min(1).default("ecommerce"),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_PUBLIC_URL: optionalHttpUrl.default(""),
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
  SENTRY_DSN: optionalHttpUrl.default(""),
  SENTRY_ENVIRONMENT: z
    .string()
    .trim()
    .min(1)
    .default(process.env.NODE_ENV ?? "development"),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(process.env.NODE_ENV === "production" ? 0.1 : 0),
  SENTRY_RELEASE: z.string().trim().optional().default(""),

  // 部署时区：日志、迁移和维护窗口统一使用显式 IANA 时区。
  APP_TIMEZONE: z
    .string()
    .trim()
    .min(1)
    .default("UTC")
    .refine(
      (value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      },
      { message: "必须是有效 IANA 时区，例如 UTC 或 Asia/Shanghai" },
    ),

  // 日志
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  // 安全:生产环境强制校验密钥强度(本地演示可显式关闭)
  //
  // ⚠️ 空值必须按 NODE_ENV 自动判定，**不能**沿用 booleanFromString（会把 "" 解析成 false）：
  //    `.env.example` 这一行默认留空，运维照抄后 REQUIRE_STRONG_SECRETS=false 会一票关停
  //    全部四道生产守卫（弱 JWT 密钥 / mock 免费下单 / 无密码 Redis / 占位品牌），
  //    而后台看不到任何异常（P1-4，已用真实 zod 复现）。
  //    显式写 "false" 才关闭（仅限本地演示）。
  REQUIRE_STRONG_SECRETS: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return process.env.NODE_ENV === "production";
      return v === "true" || v === "1";
    }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // 环境变量错误属于致命配置错误，直接抛出并给出修复提示
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`环境变量配置无效：\n${issues}`);
}

export const env = parsed.data;

/**
 * 品牌名占位值 —— 全站**唯一**的品牌字面量。
 * 后台「站点设置 → 站点名称」未填写、且 `SITE_NAME` 环境变量也为空时使用。
 * 生产环境由下方守卫拒绝启动，避免占位名漏到线上 SEO / 发票 / 邮件。
 */
export const PLACEHOLDER_BRAND = "Ox Shopping";

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
  if (isWeakSecret(env.PAYMENT_CHANNEL_ENC_KEY, "dev-payment-channel-enc-key-change-me")) {
    weak.push("PAYMENT_CHANNEL_ENC_KEY");
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

// ---------- 生产守卫：占位品牌名 / 保留域发件地址直接拒绝启动 ----------
{
  const placeholders: string[] = [];
  if (!env.SITE_NAME.trim()) {
    placeholders.push(
      `SITE_NAME 未配置 → 品牌名将回落为占位值「${PLACEHOLDER_BRAND}」，` +
        `会出现在 SEO 标题、发票抬头与支付收银台`,
    );
  }
  if (!env.MAIL_FROM.trim()) {
    placeholders.push(
      `MAIL_FROM 未配置 → 发件地址将由 SITE_NAME + SITE_URL 自动拼出；` +
        `若站点域名未配置 DNS(SPF/DKIM)，邮件会被收件方拒收`,
    );
  }
  if (placeholders.length > 0 && env.REQUIRE_STRONG_SECRETS) {
    const msg =
      `[警告] 生产环境存在未配置的站点标识项：\n` +
      placeholders.map((p) => `  - ${p}`).join("\n") +
      `\n请在 .env 中补齐后重新部署。`;
    if (process.env.NEXT_PHASE === "phase-production-build") {
      console.warn(msg);
    } else {
      throw new Error(`[启动失败] ${msg}`);
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

/**
 * 生产环境是否允许模拟支付（免费下单）。
 *
 * 为什么需要这个守卫：`effectivePaymentMode="mock"` 时下单即「已支付」（模拟），
 * 真实收款为 0——生产环境漏配 Stripe 密钥或误设 PAYMENT_MODE=mock 时，
 * 这是最危险的静默资金事故（订单全部免费、无任何报错）。
 * 与 JWT 弱密钥同款守卫：REQUIRE_STRONG_SECRETS=true（生产默认）时拒绝启动，
 * 除非运营显式设置 ALLOW_MOCK_PAYMENT_IN_PROD=true（本地演示/测试不受影响）。
 */
export const mockPaymentAllowedInProd: boolean =
  env.ALLOW_MOCK_PAYMENT_IN_PROD || !env.REQUIRE_STRONG_SECRETS;

// ---------- 生产守卫：mock 支付（免费下单）直接拒绝启动 ----------
if (
  env.REQUIRE_STRONG_SECRETS &&
  effectivePaymentMode === "mock" &&
  !env.ALLOW_MOCK_PAYMENT_IN_PROD
) {
  const msg =
    `[启动失败] 生产环境(REQUIRE_STRONG_SECRETS=true)支付模式为 mock(模拟支付/免费下单)：\n` +
    `  - 若要真实收款：配置 STRIPE_SECRET_KEY(+STRIPE_WEBHOOK_SECRET) 或在后台「支付渠道 → Stripe」填入密钥\n` +
    `  - 若确属演示/测试用途：显式设置 ALLOW_MOCK_PAYMENT_IN_PROD=true 跳过此检查\n` +
    `未配置就继续运行，所有订单都会被「模拟支付」直接标记已支付（真实收款为 0）。`;
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.warn(`[警告] ${msg}`);
  } else {
    throw new Error(msg);
  }
}

/**
 * REDIS_URL 是否携带凭据（`redis://:password@host:6379` 或带用户名）。
 * 供生产守卫与测试复用；无法解析的 URL 视为「无凭据」（更保守）。
 */
export function redisUrlHasCredentials(url: string): boolean {
  try {
    const u = new URL(url);
    return u.username.length > 0 || u.password.length > 0;
  } catch {
    return false;
  }
}

// ---------- 生产守卫：启用无密码 Redis 直接拒绝启动（B2）----------
/**
 * 为什么需要：Redis 承载全局限流计数、缓存与调度锁。无密码时，任何能连上 6379 的进程
 * 都能读改/清空全部键 —— 清掉限流计数即可绕过登录/注册/下单限流，写入伪造缓存可污染
 * 商品价格等展示数据。生产 compose 已把 6379 绑定到 127.0.0.1 并要求 --requirepass，
 * 但自有部署（裸机/K8s/云托管）极易漏配，所以这里与 JWT/mock 支付同款 fail-fast。
 *
 * 判定：Redis 启用 + REQUIRE_STRONG_SECRETS=true + URL 无凭据 → 拒绝启动。
 * 本地演示（REQUIRE_STRONG_SECRETS=false）与 REDIS_ENABLED=false 不受影响。
 * 确有内网隔离保障时可显式设置 ALLOW_PASSWORDLESS_REDIS_IN_PROD=true 豁免。
 */
if (
  env.REDIS_ENABLED &&
  env.REQUIRE_STRONG_SECRETS &&
  !env.ALLOW_PASSWORDLESS_REDIS_IN_PROD &&
  !redisUrlHasCredentials(env.REDIS_URL)
) {
  const msg =
    `[启动失败] 生产环境(REQUIRE_STRONG_SECRETS=true)启用了 Redis，但 REDIS_URL 未包含密码：\n` +
    `  - 生成密码：openssl rand -hex 24\n` +
    `  - Redis 侧启动参数加：--requirepass <密码>\n` +
    `  - 应用侧：REDIS_URL=redis://:<密码>@<host>:6379（密码含特殊字符需 URL 编码）\n` +
    `  - 不使用 Redis：REDIS_ENABLED=false（限流/缓存退化为单进程内存实现，多实例不一致）\n` +
    `  - 确有内网隔离保障：显式设置 ALLOW_PASSWORDLESS_REDIS_IN_PROD=true\n` +
    `无密码 Redis 允许任何可达进程清空限流计数（绕过限流）并伪造缓存数据。`;
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.warn(`[警告] ${msg}`);
  } else {
    throw new Error(msg);
  }
}

/** S3 存储所需的完整配置；生产环境不允许缺项后静默退回 local。 */
const requiredS3Keys = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_URL",
] as const;

const missingS3Keys = requiredS3Keys.filter((key) => !env[key].trim());

/** S3 存储是否可用（显式 s3 且六项配置齐全）。 */
export const isS3Configured = env.STORAGE_DRIVER === "s3" && missingS3Keys.length === 0;

// ---------- 生产守卫：存储不得静默降级到容器本地盘 ----------
if (env.REQUIRE_STRONG_SECRETS && !isS3Configured) {
  const detail =
    env.STORAGE_DRIVER === "local"
      ? "STORAGE_DRIVER=local：容器重建会丢失上传文件"
      : `STORAGE_DRIVER=s3 但配置不完整：${missingS3Keys.join(", ")}`;
  const msg =
    `[启动失败] ${detail}。\n` +
    `生产必须配置 S3_ENDPOINT、S3_REGION、S3_BUCKET、S3_ACCESS_KEY_ID、` +
    `S3_SECRET_ACCESS_KEY、S3_PUBLIC_URL；配置缺失时禁止静默降级到 local。`;
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.warn(`[警告] ${msg}`);
  } else {
    throw new Error(msg);
  }
}

/** 实际生效的存储驱动（仅非生产降级配置可能得到 local）。 */
export const effectiveStorageDriver: "s3" | "local" = isS3Configured ? "s3" : "local";

/**
 * 品牌名的最终兜底。优先级：`SITE_NAME` 环境变量 → 内置占位名。
 * 运行期真实品牌以数据库 `site_settings.siteName` 为准（后台可改），
 * 本常量只服务于「数据库还没数据」的场景（SEO 元数据、发票、邮件、收银台）。
 *
 * ⚠️ 生产部署必须在 .env 里设置 SITE_NAME —— 否则占位品牌名会出现在
 * SEO 标题、发票抬头与 PayPal 收银台上。上方守卫会在生产环境直接拒绝启动。
 */
export const brandFallback: string = env.SITE_NAME.trim() || PLACEHOLDER_BRAND;

/** `SITE_URL` 的域名（用于拼默认发件地址）；解析失败时回落 localhost。 */
const siteHost: string = (() => {
  try {
    return new URL(env.SITE_URL).hostname;
  } catch {
    return "localhost";
  }
})();

/**
 * 实际使用的发件地址：`MAIL_FROM` 显式配置优先，否则由品牌名 + 站点域名拼出
 * （如 `Acme <no-reply@acme.com>`）。这样既不写死任何品牌/域名字面量，
 * 又能保证默认值与站点自身域名一致 —— 比 `no-reply@example.com` 可投递得多。
 */
export const mailFrom: string = env.MAIL_FROM.trim() || `${brandFallback} <no-reply@${siteHost}>`;

/**
 * 客服邮箱的最终兜底：`SUPPORT_EMAIL` 优先，否则取发件地址里的地址
 * （`"Brand <a@b.com>"` → `"a@b.com"`）。仍然为空说明运营未做任何配置，
 * 此时前台会隐藏联系入口而不是显示占位地址。
 */
export const supportEmailFallback: string = (() => {
  if (env.SUPPORT_EMAIL.trim()) return env.SUPPORT_EMAIL.trim();
  const m = /<([^>]+)>/.exec(mailFrom);
  return (m?.[1] ?? mailFrom).trim();
})();

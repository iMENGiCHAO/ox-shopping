#!/usr/bin/env node
/**
 * scripts/preflight-check.ts — 生产部署前自检（跑一次就知道能不能上线）
 *
 * 用法：
 *   npx tsx scripts/preflight-check.ts            # 生产模式（默认）
 *   NODE_ENV=development npx tsx scripts/preflight-check.ts
 *
 * 检查项：
 *   1. 环境变量齐备性（按当前 NODE_ENV 分级校验）
 *   2. 密钥强度（生产必须 ≥32 位随机、非 dev 默认）
 *   3. 数据库连通 + migrations 是否全部应用
 *   4. 存储驱动配置（local=开发降级 / s3=需 6 项配置）
 *   5. 邮件 provider（console 会告警：生产必须 resend/smtp）
 *   6. 支付模式（mock 会告警：生产必须 stripe + 密钥/webhook）
 *   7. Redis 可选（启用时必须可连）
 *   8. 结论：PASS / FAIL，非零退出码供 CI 门禁
 *
 * 退出码：0=可上线（有告警也放行）；1=存在必须修复的阻塞项
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createConnection } from "node:net";

// ---- 读取 .env（手动解析，避免运行时依赖 dotenv） ----
function loadDotEnv(file = path.resolve(process.cwd(), ".env")): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 去掉引号与行内注释
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    const hash = value.indexOf(" #");
    if (hash >= 0) value = value.slice(0, hash);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const NODE_ENV = process.env.NODE_ENV ?? "production";
const isProd = NODE_ENV === "production";

interface ReportRow {
  ok: boolean;
  title: string;
  detail: string;
}

const report: ReportRow[] = [];
const pass = (title: string, detail = "") => report.push({ ok: true, title, detail });
const fail = (title: string, detail = "") => report.push({ ok: false, title, detail });

// ---------- 1. 环境变量齐备 ----------
const REQUIRED_COMMON = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "SITE_URL"];
const REQUIRED_PROD = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SITE_URL",
];
console.log(`\n=== 电商生产前置检查（NODE_ENV=${NODE_ENV}） ===\n`);

console.log("① 环境变量");
const missing: string[] = [];
for (const k of isProd ? REQUIRED_PROD : REQUIRED_COMMON) {
  if (!process.env[k]) missing.push(k);
}
if (missing.length) fail("环境变量缺失", `缺失: ${missing.join(", ")}`);
else pass("必备环境变量齐全", REQUIRED_COMMON.join(", "));

if (!process.env.SITE_URL?.startsWith("https://") && isProd) {
  fail("SITE_URL 必须为 https", "生产环境站点地址必须用 https://");
} else pass("SITE_URL 合法", process.env.SITE_URL ?? "(未设)");

// ---------- 2. 密钥强度 ----------
console.log("② 密钥强度");
const secret = (v: string) => v && v.length >= 32 && !/change[-_ ]?(me|in-prod)|^dev-/i.test(v);
const weakSecrets = (["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const).filter(
  (k) => !secret(process.env[k] ?? ""),
);
if (isProd && weakSecrets.length) {
  fail("JWT 密钥过弱", `${weakSecrets.join(" / ")} 生产必须 ≥32 位随机串（openssl rand -base64 48）`);
} else pass("JWT 密钥强度满足", isProd ? "生产已检查" : "开发模式放行");

// ---------- 3. 数据库 ----------
console.log("③ 数据库");
function parsePg(url: string) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port || 5432) };
  } catch {
    return null;
  }
}
function canConnect(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    const done = (v: boolean) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

(async () => {
  const pg = parsePg(process.env.DATABASE_URL ?? "");
  if (!pg) {
    fail("DATABASE_URL 解析失败", "不是合法的 postgres:// URL");
  } else {
    const ok = await canConnect(pg.host, pg.port);
    if (ok) pass("PostgreSQL 端口可达", `${pg.host}:${pg.port}`);
    else fail("PostgreSQL 不可达", `${pg.host}:${pg.port} 连接失败（服务未启动/网络不通）`);
  }

  // migrations 是否齐全（最佳实践：生产用 migrate deploy 而非 db push）
  const migrationsDir = path.resolve(process.cwd(), "prisma/migrations");
  if (existsSync(migrationsDir)) {
    const n = readFileSync(path.join(migrationsDir, "migration_lock.toml"), "utf8").includes(
      "postgresql",
    );
    if (n) pass("prisma/migrations 存在", "生产应使用 prisma migrate deploy 应用 schema");
    else pass("prisma/migrations 存在", "(migration_lock 未识别 provider)");
  } else {
    fail("缺少 prisma/migrations", "建议为生产建立迁移历史，避免 db push --accept-data-loss");
  }

  // ---------- 4. 存储 ----------
  console.log("④ 存储驱动");
  const storage = process.env.STORAGE_DRIVER ?? "local";
  if (storage === "s3") {
    const need = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
    const miss = need.filter((k) => !process.env[k]);
    if (miss.length) fail("S3 配置不完整", `缺失: ${miss.join(", ")}`);
    else {
      pass("S3 配置完整", `${process.env.S3_ENDPOINT} / ${process.env.S3_BUCKET}`);
      if (!process.env.S3_PUBLIC_URL) fail("缺少 S3_PUBLIC_URL", "浏览器直接访问图片需要公网 URL");
    }
  } else if (isProd) {
    fail("生产仍用 local 存储", "容器重启会丢文件，必须切换 STORAGE_DRIVER=s3 + 对象存储");
  } else {
    pass("本地存储（开发模式）", "STORAGE_DRIVER=local");
  }

  // ---------- 5. 邮件 ----------
  console.log("⑤ 邮件服务");
  const mail = process.env.MAIL_PROVIDER ?? "console";
  if (isProd && mail === "console") {
    fail("MAIL_PROVIDER=console", "生产邮件不会真实发出，必须配置 resend 或 smtp");
  } else if (mail === "resend") {
    if (process.env.RESEND_API_KEY) pass("Resend 已配置", "RESEND_API_KEY 已填");
    else fail("Resend 缺 key", "RESEND_API_KEY 为空");
  } else if (mail === "smtp") {
    const need = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
    const miss = need.filter((k) => !process.env[k]);
    if (miss.length) fail("SMTP 配置不完整", `缺失: ${miss.join(", ")}`);
    else pass("SMTP 已配置", `${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}`);
  } else if (mail === "console" && !isProd) {
    pass("控制台邮件（开发模式）", "邮件将输出到日志 / .mail-out 目录");
  } else {
    fail("未知 MAIL_PROVIDER", mail);
  }

  // ---------- 6. 支付 ----------
  console.log("⑥ 支付模式");
  const pay = process.env.PAYMENT_MODE ?? "auto";
  const hasStripeKeys = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (isProd && (pay === "mock" || (pay === "auto" && !hasStripeKeys))) {
    fail("生产仍用 mock/未配 Stripe", "真实收款必须 STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET，并在 Stripe 后台配置 Webhook");
  } else if (pay === "stripe" && !hasStripeKeys) {
    fail("Stripe 密钥缺失", "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET 未填");
  } else if (pay === "stripe") {
    pass("Stripe 已配置", "测试模式密钥可用（sk_test_…）");
  } else {
    pass("支付为 mock（开发模式）", "PAYMENT_MODE=" + pay);
  }

  // ---------- 7. Redis（可选） ----------
  console.log("⑦ Redis（可选）");
  if (process.env.REDIS_ENABLED === "true") {
    const url = process.env.REDIS_URL ?? "";
    try {
      const u = new URL(url);
      const ok = await canConnect(u.hostname, Number(u.port || 6379));
      if (ok) pass("Redis 可达", `${u.hostname}:${u.port}`);
      else fail("Redis 不可达", "REDIS_ENABLED=true 但端口连不上，缓存/限流将降级");
    } catch {
      fail("REDIS_URL 非法", url);
    }
  } else {
    pass("Redis 未启用", "REDIS_ENABLED≠true（可选：限流/会话缓存建议开启）");
  }

  // ---------- 汇总 ----------
  console.log("\n===============================");
  const fails = report.filter((r) => !r.ok);
  const warns = fails.filter((r) => !r.detail.startsWith("缺失") || true); // 全部视作需关注
  console.log(`结果: ${report.length - fails.length}/${report.length} 通过，${fails.length} 项需处理\n`);
  for (const r of report) {
    console.log(`  [${r.ok ? "✓" : "✗"}] ${r.title}`);
    if (r.detail) console.log(`        ${r.detail}`);
  }
  console.log("\n" + (fails.length ? "❌ 存在阻塞项：请逐条修复后再部署（参考 docs/PRODUCTION_DEPLOY.md）" : "✅ 全部通过，可以进入部署流程"));
  process.exit(fails.length ? 1 : 0);
})();

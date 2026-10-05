#!/usr/bin/env node
/**
 * 生产部署前门禁：复用应用 env.ts 启动守卫，并对真实 PostgreSQL/Prisma 迁移做检查。
 * 任何阻塞项返回非零退出码；检查过程不执行 migrate、db push 或 seed。
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createConnection } from "node:net";
import { spawnSync } from "node:child_process";
import { config as loadEnvFile } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnvFile({ path: path.resolve(process.cwd(), ".env") });
// next 16.3.6 起 process.env.NODE_ENV 的类型为只读（Next 类型声明收紧）——
// 用可写视图赋值，语义不变（仅本地 preflight 兜底默认值）
(process.env as Record<string, string | undefined>).NODE_ENV ||= "production";

const isProd = process.env.NODE_ENV === "production";
const report: { ok: boolean; title: string; detail: string }[] = [];
const pass = (title: string, detail = "") => report.push({ ok: true, title, detail });
const fail = (title: string, detail = "") => report.push({ ok: false, title, detail });
const value = (key: string) => process.env[key]?.trim() ?? "";

const prismaCli = path.resolve(process.cwd(), "node_modules/prisma/build/index.js");

function prismaCommand(args: string[]): ReturnType<typeof spawnSync> {
  return existsSync(prismaCli)
    ? command(process.execPath, [prismaCli, ...args])
    : command("npx", ["--no-install", "prisma", ...args]);
}

function command(commandName: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(commandName, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function canConnect(host: string, port: number, timeoutMs = 3_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function main() {
  console.log(`\n=== Ox Shopping 部署门禁（NODE_ENV=${process.env.NODE_ENV}） ===\n`);

  console.log("① 应用环境守卫（src/lib/env.ts）");
  // server-only 在 react-server 条件下解析为空模块。用独立 Node 子进程导入真实 env.ts，
  // 避免维护一份会在生产漂移的“近似校验”；不输出任何密钥值。
  const envGuard = command(process.execPath, [
    "--conditions=react-server",
    "--import",
    "tsx",
    "--eval",
    'import { env, isS3Configured, effectiveStorageDriver } from "./src/lib/env.ts"; console.log(JSON.stringify({nodeEnv:env.NODE_ENV,strongSecrets:env.REQUIRE_STRONG_SECRETS,s3:isS3Configured,storage:effectiveStorageDriver,timezone:env.APP_TIMEZONE}));',
  ]);
  if (envGuard.status === 0) {
    pass(
      "应用启动守卫通过",
      String(envGuard.stdout ?? "")
        .trim()
        .split("\n")
        .at(-1) ?? "真实 env.ts 校验通过",
    );
  } else {
    const detail = `${envGuard.stderr || envGuard.stdout || "env.ts 拒绝配置"}`.trim();
    fail("应用启动守卫失败", detail);
  }

  if (isProd && value("REQUIRE_STRONG_SECRETS") === "false") {
    fail(
      "生产关闭了强配置守卫",
      "REQUIRE_STRONG_SECRETS 只能由应用真实配置启用；请删除 false 或设为 true",
    );
  } else {
    pass("强配置策略", isProd ? "生产强配置守卫启用" : "开发模式");
  }

  const siteUrl = value("SITE_URL");
  if (!siteUrl) fail("SITE_URL 缺失", "必须配置站点绝对 URL");
  else if (isProd && !siteUrl.startsWith("https://")) fail("SITE_URL 非 HTTPS", siteUrl);
  else pass("SITE_URL", siteUrl);

  console.log("\n② 外部服务真实配置");
  const storage = value("STORAGE_DRIVER") || "local";
  const s3Required = [
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_PUBLIC_URL",
  ];
  if (storage !== "s3") {
    if (isProd) fail("存储驱动不安全", "生产必须 STORAGE_DRIVER=s3，禁止容器本地盘静默降级");
    else pass("本地存储（开发模式）", "仅开发允许 STORAGE_DRIVER=local");
  } else {
    const missing = s3Required.filter((key) => !value(key));
    if (missing.length) fail("S3 配置不完整", `缺失: ${missing.join(", ")}`);
    else {
      for (const key of ["S3_ENDPOINT", "S3_PUBLIC_URL"]) {
        try {
          const url = new URL(value(key));
          if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
        } catch {
          fail(`${key} 非法`, "必须是绝对 http(s) URL");
        }
      }
      if (!report.some((row) => !row.ok && row.title.startsWith("S3_"))) {
        pass("S3 配置完整", `${value("S3_ENDPOINT")} / ${value("S3_BUCKET")}`);
      }
    }
  }

  const mail = value("MAIL_PROVIDER") || "console";
  if (isProd && mail === "console") {
    fail("MAIL_PROVIDER=console", "生产邮件不会投递，必须使用 resend 或 smtp");
  } else if (mail === "resend" && !value("RESEND_API_KEY")) {
    fail("Resend 缺 key", "RESEND_API_KEY 为空");
  } else if (mail === "smtp") {
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((key) => !value(key));
    if (missing.length) fail("SMTP 配置不完整", `缺失: ${missing.join(", ")}`);
    else pass("SMTP 配置完整", `${value("SMTP_HOST")}:${value("SMTP_PORT") || "587"}`);
  } else if (mail === "console" && !isProd) {
    pass("控制台邮件（开发模式）", "邮件只进入本地输出");
  } else if (mail !== "console") {
    pass("邮件配置", mail);
  }

  if (isProd) {
    const payment = value("PAYMENT_MODE") || "auto";
    if (payment === "mock" || (payment === "auto" && !value("STRIPE_SECRET_KEY"))) {
      fail("支付仍是 mock/未配真实密钥", "生产必须配置 Stripe 密钥和 webhook secret");
    } else if (!value("STRIPE_SECRET_KEY") || !value("STRIPE_WEBHOOK_SECRET")) {
      fail("Stripe 配置不完整", "需要 STRIPE_SECRET_KEY 与 STRIPE_WEBHOOK_SECRET");
    } else {
      pass("Stripe 配置完整", "仍需在真实环境完成测试卡与 webhook 验收");
    }
  } else {
    pass("支付模式（开发）", value("PAYMENT_MODE") || "auto");
  }

  const sentryDsn = value("SENTRY_DSN");
  if (sentryDsn) {
    try {
      const url = new URL(sentryDsn);
      if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
      pass("Sentry DSN 合法", `${url.protocol}//${url.host}`);
    } catch {
      fail("SENTRY_DSN 非法", "必须是绝对 http(s) DSN");
    }
  } else if (isProd) {
    fail("Sentry 未配置", "生产应配置 SENTRY_DSN 以接收 5xx 告警");
  } else {
    pass("Sentry 未启用（开发模式）", "SENTRY_DSN 未配置");
  }

  console.log("\n③ PostgreSQL 与迁移历史");
  const databaseUrl = value("DATABASE_URL");
  let prisma: PrismaClient | undefined;
  if (!databaseUrl) {
    fail("DATABASE_URL 缺失", "未配置真实 PostgreSQL URL");
  } else {
    try {
      const url = new URL(databaseUrl);
      if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("protocol");
      prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      await prisma.$queryRaw`SELECT current_database() AS database`;
      pass(
        "PostgreSQL 真实查询成功",
        `${url.hostname}:${url.port || 5432}/${url.pathname.slice(1)}`,
      );
    } catch (error) {
      fail("PostgreSQL 查询失败", error instanceof Error ? error.message : String(error));
    } finally {
      await prisma?.$disconnect().catch(() => undefined);
    }
  }

  const validate = prismaCommand(["validate"]);
  if (validate.status === 0) pass("Prisma schema 合法", "prisma validate");
  else fail("Prisma schema 非法", String(validate.stderr || validate.stdout).trim());

  const migrationsDir = path.resolve(process.cwd(), "prisma/migrations");
  if (!existsSync(migrationsDir)) {
    fail("缺少迁移历史", "prisma/migrations 不存在，禁止生产使用 db push");
  } else {
    const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const malformed = migrationDirs.filter(
      (name) => !existsSync(path.join(migrationsDir, name, "migration.sql")),
    );
    if (!migrationDirs.length || malformed.length) {
      fail(
        "迁移目录不完整",
        malformed.length ? `缺少 migration.sql: ${malformed.join(", ")}` : "没有迁移",
      );
    } else {
      pass("迁移文件完整", `${migrationDirs.length} 个 migration.sql`);
    }

    const status = prismaCommand(["migrate", "status"]);
    if (status.status === 0) pass("数据库迁移已全部应用", "prisma migrate status");
    else fail("数据库存在未应用/失败迁移", String(status.stderr || status.stdout).trim());
  }

  console.log("\n④ Redis");
  if (value("REDIS_ENABLED") !== "true") {
    if (isProd) fail("Redis 未启用", "多实例下限流/缓存会退化且不一致，生产必须启用");
    else pass("Redis 未启用（开发模式）", "可使用进程内降级实现");
  } else {
    try {
      const url = new URL(value("REDIS_URL"));
      if (!url.password) throw new Error("REDIS_URL 缺少密码");
      if (await canConnect(url.hostname, Number(url.port || 6379))) {
        pass("Redis 端口可达且 URL 带密码", `${url.hostname}:${url.port || 6379}`);
      } else {
        fail("Redis 不可达", `${url.hostname}:${url.port || 6379}`);
      }
    } catch (error) {
      fail("Redis 配置非法", error instanceof Error ? error.message : String(error));
    }
  }

  // 上线就绪门禁（审计修复：README 的「必须通过 /admin/launch-readiness」自此有
  // 可执行载体）：CLI 直接调用同一 service，blocked>0 即 exit 1 → 本步阻塞。
  // 与 vitest 同思路：launch-readiness-cli 顶部把 "server-only" 重定向到空 stub。
  {
    const r = spawnSync("npx", ["--no-install", "tsx", "scripts/launch-readiness-cli.ts"], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      timeout: 60_000,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    if (r.status !== 0) {
      fail("launch-readiness 门禁（0 阻塞项）", out.split("\n").slice(-1)[0] || "存在阻塞项");
    } else {
      pass("launch-readiness 门禁（0 阻塞项）", "收款/邮件/管理员等 7 项检查通过");
    }
  }

  console.log("\n===============================");
  const failures = report.filter((row) => !row.ok);
  for (const row of report) {
    console.log(`  [${row.ok ? "✓" : "✗"}] ${row.title}`);
    if (row.detail) console.log(`        ${row.detail}`);
  }
  console.log(
    `\n结果: ${report.length - failures.length}/${report.length} 通过，${failures.length} 项阻塞`,
  );
  console.log(
    failures.length
      ? "❌ 禁止部署：请修复全部阻塞项（仅参考 docs/PRODUCTION_DEPLOY_2026.md）"
      : "✅ 部署门禁通过；继续执行备份、部署和上线后 smoke",
  );
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error("preflight 自身执行失败：", error);
  process.exitCode = 1;
});

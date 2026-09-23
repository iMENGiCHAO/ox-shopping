import { execFileSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/**
 * Test database safety gate.
 *
 * This must stay synchronous and side-effect free: global setup calls it before
 * the first SQL statement. Only a syntactically valid PostgreSQL URL whose
 * database name ends in the literal suffix `_test` is accepted.
 */
export function assertSafeTestDatabaseUrl(rawUrl: string | undefined): string {
  const value = rawUrl?.trim() ?? "";
  if (!value) {
    throw new Error(
      "[global-setup] DATABASE_URL is required for database-backed tests; refusing to run",
    );
  }
  if (value !== rawUrl) {
    throw new Error(
      "[global-setup] DATABASE_URL has surrounding whitespace; refusing ambiguous test configuration",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("[global-setup] DATABASE_URL is not a valid URL; refusing to run");
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      "[global-setup] DATABASE_URL must use postgres:// or postgresql://; refusing to run",
    );
  }

  const encodedName = parsed.pathname.replace(/^\/+/, "");
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(encodedName);
  } catch {
    throw new Error("[global-setup] DATABASE_URL has an invalid database name; refusing to run");
  }

  if (!databaseName || !databaseName.endsWith("_test") || /[\s/?#\\]/.test(databaseName)) {
    throw new Error(
      "[global-setup] DATABASE_URL database name must end with the literal suffix _test; refusing to run",
    );
  }

  return value;
}

/**
 * `npm run test:unit` must not initialize or mutate a database. Vitest 2 uses
 * one root config for unit and integration projects, so infer the explicit CLI
 * selection here. With no unit-only selector we conservatively initialize DB.
 */
export function shouldInitializeDatabase(argv: readonly string[] = process.argv): boolean {
  const normalized = argv.map((arg) => arg.replaceAll("\\", "/"));
  const selectsUnit = normalized.some(
    (arg) => !arg.startsWith("-") && /(?:^|\/)tests\/unit(?:\/|$)/.test(arg),
  );
  const selectsIntegration = normalized.some(
    (arg) => !arg.startsWith("-") && /(?:^|\/)tests\/integration(?:\/|$)/.test(arg),
  );
  return selectsIntegration || !selectsUnit;
}

function runPrisma(dbUrl: string, args: readonly string[]): void {
  execFileSync("npx", ["prisma", ...args], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
}

function runSeed(dbUrl: string): void {
  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
}

/**
 * Initialize a confirmed test database once before DB-backed Vitest projects.
 * Every SQL/Prisma failure is fatal; tests must never report green after a
 * partially initialized or production-like database.
 */
export default function globalSetup(): void {
  if (!shouldInitializeDatabase()) {
    console.log("[global-setup] unit-only selection: database setup disabled");
    return;
  }

  config({ path: path.resolve(process.cwd(), ".env.test"), override: false });
  config({ path: path.resolve(process.cwd(), ".env"), override: false });

  const dbUrl = assertSafeTestDatabaseUrl(process.env.DATABASE_URL);
  if (process.env.SKIP_DB_PUSH === "true") {
    console.log("[global-setup] SKIP_DB_PUSH=true: verified test URL, database setup skipped");
    return;
  }

  // 迁移历史现在是测试与生产的唯一 schema 来源。每次 integration 在已确认的
  // *_test 库中完整 reset + migrate，既验证从空库可部署，也不会让旧 db push
  // 产生的漂移悄悄绕过新 migration。
  runPrisma(dbUrl, ["migrate", "reset", "--force", "--skip-seed"]);
  console.log("[global-setup] verified test database migrations applied from empty state");

  // 继续显式重放 Prisma schema 无法表达的原始约束，作为并发保护双保险。
  runPrisma(dbUrl, ["db", "execute", "--file", "prisma/sql/raw-indexes.sql"]);
  console.log("[global-setup] verified raw indexes synchronized");

  runSeed(dbUrl);
  console.log("[global-setup] verified test database seeded");
}

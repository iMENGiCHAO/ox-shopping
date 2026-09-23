#!/usr/bin/env node

/**
 * Safe commercial hardening regression entrypoint.
 *
 * Default mode is unit-only and forces SKIP_DB_PUSH=true. Integration mode is
 * opt-in and must receive both an explicit *_test DATABASE_URL and an exact
 * database-name confirmation. No dotenv fallback is used for this confirmation.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VITEST = path.join(ROOT, "node_modules/vitest/vitest.mjs");
const args = new Set(process.argv.slice(2));

for (const arg of args) {
  if (arg !== "--integration") {
    console.error(`[commercial-hardening] unknown argument: ${arg}`);
    process.exit(2);
  }
}

function databaseName(rawUrl) {
  if (!rawUrl || rawUrl !== rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!name.endsWith("_test") || /[\s/?#\\]/.test(name)) return null;
    return name;
  } catch {
    return null;
  }
}

const integration = args.has("--integration");
const testFile = integration
  ? "tests/integration/commercial-hardening.test.ts"
  : "tests/unit/commercial-hardening.test.ts";
const childEnv = { ...process.env };

if (!integration) {
  // Explicit opt-out is both a safety property and evidence in CI logs.
  childEnv.SKIP_DB_PUSH = "true";
} else {
  const name = databaseName(process.env.DATABASE_URL);
  if (!name) {
    console.error(
      "[commercial-hardening] integration mode refused: set DATABASE_URL explicitly to a PostgreSQL *_test URL",
    );
    process.exit(2);
  }
  if (process.env.CONFIRM_TEST_DATABASE !== name) {
    console.error(
      `[commercial-hardening] integration mode refused: set CONFIRM_TEST_DATABASE=${name} after verifying the target`,
    );
    process.exit(2);
  }
  console.log(`[commercial-hardening] confirmed isolated test database: ${name}`);
}

if (process.env.SKIP_DB_PUSH === "true") {
  console.log("[commercial-hardening] SKIP_DB_PUSH=true: no database initialization will run");
}

const result = spawnSync(
  process.execPath,
  [VITEST, "run", testFile, "--config", "vitest.config.ts", "--reporter=verbose"],
  {
    cwd: ROOT,
    env: childEnv,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`[commercial-hardening] failed to start Vitest: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

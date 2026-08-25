import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

/**
 * E2E 测试（Playwright）
 * 前置条件：
 *   1. PostgreSQL 已启动并执行过迁移与种子（docker compose up -d postgres redis 或本地）
 *   2. npm run dev 由 webServer 自动拉起（使用 .env 配置）
 * 运行：npm run test:e2e
 */
loadEnv({ path: path.resolve(process.cwd(), ".env"), override: false });

const baseURL = process.env.SITE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "zh-CN",
    // 测试断言中文文案：强制浏览器语言为中文，避免 i18n 按 Accept-Language 回退英文
    extraHTTPHeaders: { "Accept-Language": "zh-CN,zh;q=0.9" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

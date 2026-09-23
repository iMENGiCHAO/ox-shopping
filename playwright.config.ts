import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { assertSafeTestDatabaseUrl } from "./tests/helpers/global-setup";

/**
 * E2E 测试（Playwright）
 * 前置条件：
 *   1. PostgreSQL 已启动并执行过迁移与种子（docker compose up -d postgres redis 或本地）
 *   2. npm run dev 由 webServer 自动拉起（使用 .env 配置）
 * 运行：npm run test:e2e
 */
loadEnv({ path: path.resolve(process.cwd(), ".env"), override: false });

// E2E exercises mutating business flows. Refuse to start its web server unless
// the inherited/explicit database is unambiguously a *_test database.
assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

const baseURL = process.env.SITE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    // 30s：fullPage 长页（PLP 20+ 商品图）在 Time Machine 机械卷上 dev 模式生成
    // 即需 10s+，默认 10s 会把"生成慢"误报为失败。
    // 注：`toHaveScreenshot` **不接受** timeout 选项（写了会 TS2769），
    // 断言级超时只能通过 expect.timeout 配置。
    timeout: 30_000,
    // 视觉基线容差 2%：吸收 Chromium 抗锯齿/全页拼接的亚像素噪声（实测顶栏边缘
    // 约 1% 抖动）；真实回归（占位图烙基线 30%+、排序换品 10%+）远超此阈值。
    // （R5 注释里宣称的 maxDiffPixelRatio 容忍此前从未真正配置，此处补齐）
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  // R5 修复：去掉快照路径中的 {platform} 后缀（默认 {arg}-{projectName}-{platform}{ext}），
  // 使 macOS 本地生成的基线与 Linux CI 共用同一路径，避免 CI 首跑 visual 测试必失败。
  // 注意：字体渲染在不同 OS 上可能有亚像素差异，CI 阈值已通过 maxDiffPixelRatio 容忍。
  snapshotPathTemplate:
    "{testDir}/{testFileDir}/__screenshots__/{testName}/{arg}-{projectName}{ext}",
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
    // 300s：Time Machine 机械卷上 Turbopack 首次编译 + 健康检查实测超 120s
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

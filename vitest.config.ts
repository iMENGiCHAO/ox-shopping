import { defineConfig } from "vitest/config";
import path from "node:path";

const normalizedArgv = process.argv.map((arg) => arg.replaceAll("\\", "/"));
const selectsUnit = normalizedArgv.some(
  (arg) => !arg.startsWith("-") && /(?:^|\/)tests\/unit(?:\/|$)/.test(arg),
);
const selectsIntegration = normalizedArgv.some(
  (arg) => !arg.startsWith("-") && /(?:^|\/)tests\/integration(?:\/|$)/.test(arg),
);
const unitOnlySelection = selectsUnit && !selectsIntegration;

export default defineConfig({
  // 注意：不用 vite-tsconfig-paths / @vitejs/plugin-react（ESM-only 插件在 CJS 加载的
  // 配置文件中会失败）。TS/TSX 由 esbuild 原生转换，@ 别名在此手动声明。
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Unit-only CLI selections never attach the DB-mutating global setup.
    // Integration and unqualified runs keep the fail-closed test DB gate.
    globalSetup: unitOnlySelection ? [] : ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/setup-env.ts"],
    env: unitOnlySelection ? { VITEST_UNIT_ONLY: "true" } : {},
    pool: "forks",
    // Vitest 4 将 poolOptions 提升为顶层选项；仍保持单 worker 串行，避免共享测试库竞态。
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 90000,
  },
  resolve: {
    alias: [
      {
        find: "@",
        replacement: path.resolve(__dirname, "src"),
      },
      {
        // server-only 包在非 RSC 环境会抛错，测试中替换为空实现
        find: "server-only",
        replacement: path.resolve(__dirname, "tests/helpers/server-only-stub.ts"),
      },
    ],
  },
  esbuild: {
    jsx: "automatic",
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // 注意：不用 vite-tsconfig-paths / @vitejs/plugin-react（ESM-only 插件在 CJS 加载的
  // 配置文件中会失败）。TS/TSX 由 esbuild 原生转换，@ 别名在此手动声明。
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/setup-env.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30000,
    hookTimeout: 60000,
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

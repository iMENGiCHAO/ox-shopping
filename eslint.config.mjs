import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// 在 eslint-config-next 已注册对应插件的配置对象上追加规则覆盖
const configs = [...nextVitals, ...nextTs];
for (const cfg of configs) {
  if (cfg.plugins?.["@next/next"]) {
    // 旧配置显式关闭：部分营销页/政策页有意使用原生 <a>
    cfg.rules = { ...cfg.rules, "@next/next/no-html-link-for-pages": "off" };
  }
  if (cfg.plugins?.["react-hooks"]) {
    // React 19 新规：数据获取型 effect 的 setState 属既有合理模式
    cfg.rules = { ...cfg.rules, "react-hooks/set-state-in-effect": "off" };
  }
}

export default defineConfig([
  ...configs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // 与旧 next lint 口径一致：一次性脚本/测试/构建配置不参与 lint
    "scripts/**",
    "tests/**",
    "prisma/**",
    "tailwind.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "postcss.config.js",
    "*.tmp.mjs",
  ]),
  prettier,
]);

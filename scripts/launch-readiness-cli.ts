/* eslint-disable no-console */
/**
 * 上线就绪门禁 CLI —— /admin/launch-readiness 的**可执行版**。
 *
 * 背景（审计发现）：README 宣称「生产放量前必须通过 /admin/launch-readiness」，
 * 但该页是只读看板，getLaunchReadiness 全库零消费方 —— 运营拿着假绿灯放行。
 * 本 CLI 直接调用同一 service（单一口径零漂移），blocked>0 即 exit 1，
 * 由 npm run preflight 纳入门禁链（scripts/preflight-check.ts 最后一步）。
 *
 * 运行（tsx + server-only shim）：
 *   NODE_OPTIONS="--import ./scripts/server-only-shim.mjs" npx tsx scripts/launch-readiness-cli.ts
 */
import { config as loadEnvFile } from "dotenv";
import path from "node:path";

/* CJS 解析补丁：服务层按 Next 约定 `import "server-only"`，在普通 Node 进程里
   会抛错。vitest 用 alias stub（tests/helpers/server-only-stub.ts），这里是 CLI
   版：把 "server-only" 重定向到空模块，必须在 import 服务层之前打上。
   （tsx 把 .ts 编译为 CJS，走 Module._resolveFilename，不走 ESM resolve 钩子。） */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Module } = require("module") as typeof import("module");
const origResolve = (Module as unknown as { _resolveFilename: (...a: unknown[]) => string })
  ._resolveFilename;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module as any)._resolveFilename = function patched(request: string, ...args: unknown[]) {
  if (request === "server-only" || request === "client-only") {
    return require.resolve("./server-only-stub.cjs", { paths: [__dirname ?? path.dirname("")] });
  }
  return origResolve.call(this, request, ...args);
};

async function main(): Promise<void> {
  loadEnvFile();

  const { getLaunchReadiness } = await import("@/server/services/launch-readiness.service");

  const lr = await getLaunchReadiness();
  console.log("\n─── 上线就绪检查（/admin/launch-readiness 同源数据）───");
  for (const item of lr.items) {
    const mark = item.status === "blocked" ? "✗" : item.status === "warn" ? "!" : "✓";
    console.log(
      `  [${mark}] ${item.label}${item.detail ? ` — ${item.detail}` : ""}${item.action ? `（${item.action}）` : ""}`,
    );
  }
  console.log(
    `  小计：${lr.counts.ready} 就绪 / ${lr.counts.warn} 提示 / ${lr.counts.blocked} 阻塞`,
  );
  if (lr.counts.blocked > 0) {
    console.error(`❌ launch-readiness 存在 ${lr.counts.blocked} 个阻塞项 —— 禁止放量`);
    process.exit(1);
  }
  console.log("✅ launch-readiness：0 阻塞");
  process.exit(0);
}

void main();

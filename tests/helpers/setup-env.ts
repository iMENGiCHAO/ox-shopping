import { config } from "dotenv";
import path from "node:path";
import { vi } from "vitest";

/**
 * 测试环境加载：优先 .env.test；只有 DB-backed 测试才允许回退 .env。
 * 单元测试绝不能把本地/生产 .env（尤其空的可选 URL）注入测试进程。
 */
const normalizedArgv = process.argv.map((arg) => arg.replaceAll("\\", "/"));
const selectsUnit = normalizedArgv.some(
  (arg) => !arg.startsWith("-") && /(?:^|\/)tests\/unit(?:\/|$)/.test(arg),
);
const selectsIntegration = normalizedArgv.some(
  (arg) => !arg.startsWith("-") && /(?:^|\/)tests\/integration(?:\/|$)/.test(arg),
);
const unitOnlySelection =
  process.env.VITEST_UNIT_ONLY === "true" || (selectsUnit && !selectsIntegration);

config({ path: path.resolve(process.cwd(), ".env.test"), override: false });
if (!unitOnlySelection) {
  config({ path: path.resolve(process.cwd(), ".env"), override: false });
} else {
  // Vite may eagerly populate optional keys from .env before setupFiles runs.
  // Empty optional URLs are equivalent to absent config; remove them so unit
  // tests cannot inherit local/production integration settings.
  for (const key of ["S3_ENDPOINT", "S3_PUBLIC_URL", "SENTRY_DSN"]) {
    if (process.env[key] === "") delete process.env[key];
  }
}

/**
 * 测试进程**不得**启动进程内定时任务调度器。
 *
 * `src/lib/prisma.ts` 在模块求值时就会 `void import("@/server/jobs/start")` 拉起
 * 一个 60s 心跳的 setInterval（只受 `CRON_ENABLED` 与 globalThis 守卫约束）。
 * 在 vitest 里这会出问题：守卫标记挂在 globalThis 上（整个进程共享），
 * 而模块实例是**按测试文件重建**的 —— 于是 A 文件注册的定时器会在 B 文件运行时
 * 拿着已失效的模块绑定空转，抛 `runScheduledJobs is not a function`，
 * 被 vitest 记为 unhandled error，让整轮结果失真。
 *
 * 测试要的是确定性与隔离，不是后台调度；需要验证调度逻辑时直接调
 * `runScheduledJobs()` 即可，不必让它自己跑起来。
 */
process.env.CRON_ENABLED = "false";

/**
 * next/headers 的 cookies() 依赖 Next 请求上下文（AsyncLocalStorage），
 * 在直接调用 Route Handler 的测试环境不可用。这里替换为从全局变量读取，
 * 由 tests/helpers/api.ts 在每次调用前注入当前 CookieJar。
 */
export interface MockCookie {
  name: string;
  value: string;
}

interface MockCookieStore {
  get(name: string): MockCookie | undefined;
}

declare global {
  // eslint-disable-next-line no-var
  var __TEST_COOKIES__: MockCookieStore;
}

vi.mock("next/headers", () => ({
  cookies: () => globalThis.__TEST_COOKIES__,
}));

import { config } from "dotenv";
import path from "node:path";
import { vi } from "vitest";

/**
 * 集成测试环境加载：优先 .env.test，其次 .env。
 * 集成测试需要 PostgreSQL（+ 可选 Redis）；仅单元测试无此要求。
 */
config({ path: path.resolve(process.cwd(), ".env.test"), override: false });
config({ path: path.resolve(process.cwd(), ".env"), override: false });

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

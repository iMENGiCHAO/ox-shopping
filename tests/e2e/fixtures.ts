import { test as base, expect } from "@playwright/test";

/**
 * 统一夹具：商店端与管理端默认中文（断言锁定中文文案用）。
 * i18n 读取顺序 cookie → localStorage → 浏览器 Accept-Language，
 * 这里通过 context.addCookies 一次写入两个 lang cookie，保证 SSR 时即是中文。
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    const baseURL = (test.info().project.use.baseURL as string) ?? "http://localhost:3000";
    const url = new URL(baseURL);
    await context.addCookies([
      { name: "shop-lang", value: "zh", domain: url.hostname, path: "/" },
      { name: "admin-lang", value: "zh", domain: url.hostname, path: "/" },
    ]);
    await use(context);
  },
});

export { expect };

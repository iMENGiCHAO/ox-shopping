/**
 * 请求语言推断（单一事实来源）。
 *
 * 为什么单独成模块：`lib/api.ts`（server-only）与 `proxy.ts`（中间件）
 * 都需要同一套规则，各写一份必然漂移。本模块**不带 `server-only`**，
 * 以便中间件也能引入。
 *
 * 规则与 `shop-i18n-server.getLang()` 保持一致：**币种优先**（CNY → 中文），
 * 其次看显式的 `shop-lang`，都没有则默认英文（英文是站点默认语言）。
 * 只看 cookie —— API 请求与 proxy 都没有 `/zh` 路由前缀可用。
 */
import { CURRENCY_COOKIE } from "@/components/shop/currency";
import { SHOP_LANG_KEY } from "@/lib/shop-i18n";

export type RequestLang = "zh" | "en";

/** 从 cookie 读取器推断请求语言。传入 `(name) => value | undefined`。 */
export function langFromCookies(
  get: (name: string) => string | undefined | null,
): RequestLang {
  const currency = get(CURRENCY_COOKIE);
  if (currency) return currency.toUpperCase() === "CNY" ? "zh" : "en";
  return get(SHOP_LANG_KEY) === "zh" ? "zh" : "en";
}

/**
 * 是否为后台 API 路径。后台（`/api/admin/*`）是**中文产品**：
 * 它的界面语言由独立的 `admin-lang` cookie 决定（见 `lib/admin-i18n-server`），
 * 与店面的 `shop-lang` / 币种无关。
 */
export function isAdminApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/admin/");
}

/**
 * API 请求语言 —— `apiHandler` 的统一出口用它决定错误文案语言。
 *
 * 为什么要显式区分后台：`apiHandler` 原本一律按**店面**语言（`langFromCookies`）
 * 本地化错误。但后台的语言是另一套（`admin-lang`），于是出现两层错位：
 *   1. 店主把店面切成英文后，**中文后台开始报英文错误**；
 *   2. 后台专属的中文源串会经同一出口**原样漏给英文站顾客**
 *      （ERROR_ZH 只做英→中，不做中→英）。
 * 以路径切断耦合：后台恒中文，店面才看 cookie。
 *
 * 配套约束：`/api/admin/*` 的错误源串因此**可以**保持中文；
 * 而共享代码（如 `server/services/*`）里的错误源串必须是英文，
 * 否则会漏给顾客 —— 见 `scripts/qa/qa-error-lang.mjs`。
 */
export function langForApiRequest(req: {
  url: string;
  cookies: { get(name: string): { value: string } | undefined };
}): RequestLang {
  let pathname = "";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    /* 非绝对 URL（如单测直接构造）时按店面处理 */
  }
  if (isAdminApiPath(pathname)) return "zh";
  return langFromCookies((name) => req.cookies.get(name)?.value);
}

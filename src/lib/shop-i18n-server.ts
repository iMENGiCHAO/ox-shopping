import { cookies, headers } from "next/headers";
import { Lang, LANGS, SHOP_LANG_KEY, translate } from "@/lib/shop-i18n";
import { CURRENCY_COOKIE } from "@/components/shop/currency";

const LANG_COOKIE = SHOP_LANG_KEY;
const DEFAULT_LANG: Lang = "en";

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

/**
 * Read the shop language preference.
 *
 * 优先级：币种 cookie > 路由 locale 头(x-lang) > lang cookie > 默认 en
 *   - 币种 cookie：用户选择货币即决定语言（CNY → zh，其余 → en）。
 *     这是**最高优先级**——切 USD/EUR 必须回英文，不能被 /zh 路由前缀
 *     （x-lang 头）压住，否则用户选 CNY 后落在 /zh 页面时就再也切不回英文。
 *   - x-lang：由 proxy.ts 根据路径前缀注入（/zh/* → zh，/en/* → en），
 *     仅作为**无币种时**（如搜索引擎爬虫、访客）的路由级兜底，保证 /zh 页面 SEO 语言正确。
 *   - lang cookie：仅无币种、无路由前缀时兜底（历史显式语言切换）。
 *
 * 商业策略（产品定位：海外为主，国内为辅）：
 *   - 前台默认英文（无前缀），海外客户零摩擦
 *   - 选 CNY 时切中文，照顾国内场景；切回 USD/EUR 等必回英文
 */
export async function getLang(): Promise<Lang> {
  try {
    const cookieStore = await cookies();
    // 1) 币种决定语言：有 currency cookie 时即按币种判定，CNY→zh，其余→en。
    //    必须排在 x-lang 之前，否则选过 CNY 后落在 /zh 页面，切 USD 时 x-lang 会一直压着
    //    zh（路由前缀粘滞），语言切不回英文。
    const currency = cookieStore.get(CURRENCY_COOKIE)?.value;
    if (currency) return currency.toUpperCase() === "CNY" ? "zh" : "en";
    // 2) 路由级语言（proxy 按 /zh|/en 前缀注入）—— 无币种时的 SEO/爬虫兜底
    const langHeader = (await headers()).get("x-lang");
    if (isLang(langHeader)) return langHeader;
    // 3) 无币种时兜底到显式 lang cookie
    const langCookie = cookieStore.get(LANG_COOKIE)?.value;
    if (isLang(langCookie)) return langCookie;
  } catch {
    /* 非 request scope（build/seed）下 cookies() 会抛，吞掉走默认 */
  }
  return DEFAULT_LANG;
}

/** Type alias for the translator function returned by getT(). */
export type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** Server-side translator bound to the current request cookie. */
export async function getT(): Promise<TFunc> {
  const lang = await getLang();
  return (key: string, params?: Record<string, string | number>) => translate(key, lang, params);
}

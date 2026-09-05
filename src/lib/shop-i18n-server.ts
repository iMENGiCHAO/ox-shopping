import { cookies, headers } from "next/headers";
import { Lang, LANGS, translate } from "@/lib/shop-i18n";

const LANG_COOKIE = "shop-lang";
const CURRENCY_COOKIE = "shop-currency";
const DEFAULT_LANG: Lang = "en";

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

/**
 * Read the shop language preference.
 *
 * 优先级：路由 locale 头(x-lang) > lang cookie > currency cookie > 默认 en
 *   - x-lang：由 proxy.ts 根据路径前缀注入（/zh/* → zh，/en/* → en），
 *     使语言成为"路由级、可被搜索引擎收录"的事实来源（P1-1 第一步）。
 *   - lang cookie：显式切换语言（用户切过后优先，不破坏用户主动选择）
 *   - 否则看币种：CNY → zh，其他 → en
 *
 * 商业策略（产品定位：海外为主，国内为辅）：
 *   - 前台默认英文（无前缀），海外客户零摩擦
 *   - /zh 前缀或选 CNY 时切中文，照顾国内场景
 *   - 显式选过语言的客户不被动覆盖（cookie 优先）
 */
export async function getLang(): Promise<Lang> {
  try {
    // 1) 路由级语言（proxy 按 /zh|/en 前缀注入），SSR 语言感知的关键
    const langHeader = (await headers()).get("x-lang");
    if (isLang(langHeader)) return langHeader;

    const cookieStore = await cookies();
    const langCookie = cookieStore.get(LANG_COOKIE)?.value;
    if (isLang(langCookie)) return langCookie;
    // 没显式 lang cookie：根据币种推断
    const currency = cookieStore.get(CURRENCY_COOKIE)?.value;
    if (currency?.toUpperCase() === "CNY") return "zh";
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

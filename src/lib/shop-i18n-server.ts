import { cookies } from "next/headers";
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
 * 优先级：lang cookie > currency cookie > 默认 en
 *   - lang cookie 显式设置（用户在 footer 切过）→ 直接用
 *   - 否则看币种：CNY → zh，其他 → en
 *
 * 商业策略（产品定位：海外为主，国内为辅）：
 *   - 前台默认英文，海外客户零摩擦
 *   - 选 CNY 时自动切中文，照顾国内场景
 *   - 显式选过语言的客户不被动覆盖（cookie 优先）
 */
export async function getLang(): Promise<Lang> {
  try {
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

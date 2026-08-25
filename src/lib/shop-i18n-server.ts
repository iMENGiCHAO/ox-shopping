import { Lang, translate } from "@/lib/shop-i18n";

const COOKIE_KEY = "shop-lang";

/**
 * Read the shop language preference.
 * 前台面向欧美客户：固定返回 "en"；后台管理独立锁定中文（admin-i18n）。
 */
export function getLang(): Lang {
  return "en";
}

/** Type alias for the translator function returned by getT(). */
export type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** Server-side translator bound to the current request cookie + Accept-Language. */
export function getT(): TFunc {
  const lang = getLang();
  return (key: string, params?: Record<string, string | number>) => translate(key, lang, params);
}

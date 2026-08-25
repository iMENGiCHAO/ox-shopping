import { cookies } from "next/headers";
import { Lang, LANGS, translate } from "@/lib/admin-i18n";

const COOKIE_KEY = "admin-lang";

/** Read the admin language preference from the request cookie.
 *  Used in server components to translate strings without client context. */
export function getLang(): Lang {
  const store = cookies();
  const raw = store.get(COOKIE_KEY)?.value as Lang | undefined;
  if (raw && LANGS.includes(raw)) return raw;
  return "en"; // default to English (aligns with the shop frontend being English)
}

/** Server-side translator: returns a `t` function bound to the current cookie lang. */
export function getT() {
  const lang = getLang();
  return (key: string) => translate(key, lang);
}

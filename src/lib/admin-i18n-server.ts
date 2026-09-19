import { cookies } from "next/headers";
import { Lang, LANGS, translate } from "@/lib/admin-i18n";

const COOKIE_KEY = "admin-lang";

/** Read the admin language preference from the request cookie.
 *  Used in server components to translate strings without client context. */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const raw = store.get(COOKIE_KEY)?.value as Lang | undefined;
  if (raw && LANGS.includes(raw)) return raw;
  return "zh"; // 后台锁定中文（与客户端 LangProvider 默认 zh 一致）
}

/** Server-side translator: returns a `t` function bound to the current cookie lang. */
export async function getT() {
  const lang = await getLang();
  return (key: string) => translate(key, lang);
}

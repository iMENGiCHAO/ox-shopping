import type { Lang } from "@/lib/admin-i18n";
import { translate } from "@/lib/admin-i18n";

/**
 * 后台语言已锁定纯中文（与客户端 LangProvider 一致）。
 *
 * 为什么不再读 cookie：历史版本的语言切换会把 `admin-lang` 持久化到
 * cookie，此后服务端 RSC 按 cookie=en 渲染、客户端组件按锁定的 zh
 * 渲染 —— 同一页面中英混排（这正是大爷报告的 bug）。锁死服务端后，
 * 存量脏 cookie 不再产生任何影响，无需清理。
 */
export async function getLang(): Promise<Lang> {
  return "zh";
}

/** Server-side translator: 后台恒中文。 */
export async function getT() {
  return (key: string) => translate(key, "zh");
}

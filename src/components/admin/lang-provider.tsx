"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lang, LANG_LABEL, LANGS, translate } from "@/lib/admin-i18n";

const STORAGE_KEY = "admin-lang";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string) => string;
};

const LangContext = React.createContext<Ctx | null>(null);

export function LangProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  /** SSR 从 cookie 读取的初始语言；后台已锁定纯中文，忽略外部传入 */
  initialLang?: Lang;
}) {
  const [lang, setLangState] = React.useState<Lang>("zh");
  const router = useRouter();

  // 后台锁定纯中文：不再读取 localStorage / cookie / 浏览器语言
  React.useEffect(() => {}, []);

  const persist = React.useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
      document.cookie = `${STORAGE_KEY}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = React.useCallback(
    (l: Lang) => {
      if (l === lang) return;
      setLangState(l);
      persist(l);
      // 动态即时切换（不整页刷新）：
      // router.refresh() 触发 RSC 重取 + 下面 key={lang} 强制子树重挂，
      // 所有 SSR 文案立即变；客户端组件靠 t() 订阅 lang state 先一步更新
      router.refresh();
    },
    [lang, persist, router],
  );

  const toggle = React.useCallback(() => {
    setLang(lang === "zh" ? "en" : "zh");
  }, [lang, setLang]);

  const t = React.useCallback((key: string) => translate(key, lang), [lang]);

  const value = React.useMemo(() => ({ lang, setLang, toggle, t }), [lang, setLang, toggle, t]);

  return (
    <LangContext.Provider value={value}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </LangContext.Provider>
  );
}

export function useLang(): Ctx {
  const ctx = React.useContext(LangContext);
  if (!ctx) {
    // Fallback during SSR or outside provider — 中文兜底
    return {
      lang: "zh",
      setLang: () => {},
      toggle: () => {},
      t: (k: string) => translate(k, "zh"),
    };
  }
  return ctx;
}

/** Convenience hook — returns just `t`. */
export function useT() {
  return useLang().t;
}

export { LANG_LABEL, LANGS };
export type { Lang };

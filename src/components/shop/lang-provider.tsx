"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lang, LANG_LABEL, LANG_SHORT, LANGS, SHOP_LANG_KEY, translate } from "@/lib/shop-i18n";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LangContext = React.createContext<Ctx | null>(null);

/**
 * 前台面向欧美客户：固定返回 "en"，忽略 cookie / 浏览器语言。
 * 后台管理独立使用 admin-lang-provider 锁定中文。
 */
function detectInitialLang(): Lang {
  return "en";
}

export function ShopLangProvider({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  const router = useRouter();
  const [lang, setLangState] = React.useState<Lang>(initialLang);

  // 挂载时同步 cookie（其它 tab 或 SSR/CSR 不一致时纠正），但不重复 refresh
  React.useEffect(() => {
    const detected = detectInitialLang();
    if (detected !== lang) setLangState(detected);
    try {
      if (!document.cookie.includes(`${SHOP_LANG_KEY}=`)) {
        document.cookie = `${SHOP_LANG_KEY}=${detected}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      }
    } catch {
      /* ignore */
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (l: Lang) => {
    try {
      document.cookie = `${SHOP_LANG_KEY}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      localStorage.setItem(SHOP_LANG_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const setLang = React.useCallback(
    (l: Lang) => {
      if (l === lang) return;
      setLangState(l);
      persist(l);
      // 动态即时切换：
      // 1) 客户端组件立即用新 lang 重渲（t() 依赖 lang state）
      // 2) router.refresh() 让 server components 重新跑（商品名/静态文案按新 cookie 生成）
      //    RSC 是流式更新，不丢滚动 / 不丢焦点 / 卡片状态保留
      router.refresh();
    },
    [lang, router],
  );

  const toggle = React.useCallback(() => {
    setLang(lang === "zh" ? "en" : "zh");
  }, [lang, setLang]);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, lang, params),
    [lang],
  );

  const value = React.useMemo<Ctx>(() => ({ lang, setLang, toggle, t }), [lang, setLang, toggle, t]);

  // 关键: key={lang} 强制 RSC 子树在语言变化时整体重挂，
  // 这样 SSR 静态文案的 fallback 内容也会被丢弃，重新使用新 lang 的 RSC payload。
  return (
    <LangContext.Provider value={value}>
      <React.Fragment key={lang}>{children}</React.Fragment>
    </LangContext.Provider>
  );
}

/** Convenience hook — returns the lang context. */
export function useShopLang(): Ctx {
  const ctx = React.useContext(LangContext);
  if (!ctx) {
    // Fallback during SSR or outside provider — 前台英文兜底
    return {
      lang: "en",
      setLang: () => {},
      toggle: () => {},
      t: (k: string, params?: Record<string, string | number>) => translate(k, "zh", params),
    };
  }
  return ctx;
}

/** Convenience hook — returns just `t` (bound to the current language). */
export function useT() {
  return useShopLang().t;
}

export { LANG_LABEL, LANGS, LANG_SHORT };

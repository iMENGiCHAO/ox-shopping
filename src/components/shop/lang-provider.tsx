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
 * 初始语言解析：服务端 RSC 已经在 layout 阶段读 cookie 注入 initialLang；
 * 客户端挂载时如果 cookie/localStorage 出现更新（例如用户在另一个 tab 切换），
 * 同步到 context state。这里不强行覆盖 RSC 已注入的值（避免 hydration mismatch）。
 */

export function ShopLangProvider({ children, initialLang }: { children: React.ReactNode; initialLang: Lang }) {
  const router = useRouter();
  const [lang, setLangState] = React.useState<Lang>(initialLang);

  // 关键：currency-provider 切币种后 router.refresh() 触发 RSC 重跑，
  // 会把新的 initialLang 传过来（因为 getLang() 读新 cookie），
  // 这里要把 client state 同步到新值，否则 t() 还在用旧 lang。
  React.useEffect(() => {
    if (initialLang !== lang) {
      setLangState(initialLang);
    }
    // 故意依赖 initialLang；lang 是 setter 的闭包，不在依赖里
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLang]);

  // localStorage 路径已彻底移除。原因：
  //   - 之前实现从 localStorage 读 lang 覆盖服务端值，导致用户切回 USD 货币后
  //     localStorage.shop-lang=zh 残留 → 客户端又把 lang 切回中文。
  //   - 现在 lang 单一来源 = cookie（lang 自身 + currency 推断），
  //     跨 tab 同步不再需要（用户显式操作会触发 router.refresh，自然同步）。

  const persist = (l: Lang) => {
    try {
      // 只写 cookie，不写 localStorage（避免下次刷新再次被旧值拉回）
      document.cookie = `${SHOP_LANG_KEY}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
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
    // Fallback during SSR 或 provider 缺失时：返回与 SSR 注入值一致的英文上下文。
    // 旧实现 fallback 用 zh 翻译，会导致 hydration 闪屏，已修复。
    return {
      lang: "en",
      setLang: () => {},
      toggle: () => {},
      t: (k: string, params?: Record<string, string | number>) => translate(k, "en", params),
    };
  }
  return ctx;
}

/** Convenience hook — returns just `t` (bound to the current language). */
export function useT() {
  return useShopLang().t;
}

export { LANG_LABEL, LANGS, LANG_SHORT };

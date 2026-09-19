"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  convertPrice,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  FALLBACK_RATES,
  formatAmount,
  getCurrencyDef,
  parseCurrencyCode,
  type CurrencyDef,
} from "@/components/shop/currency";
import { SHOP_LANG_KEY } from "@/lib/shop-i18n";

interface CurrencyContextValue {
  def: CurrencyDef;
  code: string;
  rate: number;
  /** 把 CNY 金额按当前币种格式化 */
  format: (amountBase: number) => string;
  /** 切换币种(写 cookie + 刷新服务端渲染) */
  setCode: (code: string) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readCookie(): string {
  if (typeof document === "undefined") return DEFAULT_CURRENCY;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CURRENCY_COOKIE}=([^;]*)`));
  return parseCurrencyCode(match?.[1]);
}

/**
 * CNY ↔ zh 联动：选 CNY 时自动写 shop-lang=zh；选非 CNY 时**删除** shop-lang cookie，
 * 让服务端根据 currency cookie 推断语言（CNY→zh，其他→en）。
 *
 * 关键：必须删除而不是覆盖 shop-lang cookie。
 * 原因：router.refresh() 触发 RSC 重跑时，浏览器 cookie 可能还未更新，
 * 导致服务端读到旧的 shop-lang=zh，语言切换不回来。
 * 删除后服务端会回退到 currency cookie 推断，始终正确。
 *
 * 同时清 localStorage（旧版本残留，避免 ShopLangProvider 读到旧值）。
 */
function syncLangCookie(currency: string) {
  if (typeof document === "undefined") return;
  const isCNY = currency.toUpperCase() === "CNY";
  if (isCNY) {
    // CNY：显式设置 shop-lang=zh
    document.cookie = `${SHOP_LANG_KEY}=zh; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      localStorage.setItem(SHOP_LANG_KEY, "zh");
    } catch {
      /* localStorage 不可用时静默 */
    }
  } else {
    // 非 CNY：删除 shop-lang cookie，让服务端根据 currency 推断为 en
    document.cookie = `${SHOP_LANG_KEY}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
    try {
      localStorage.removeItem(SHOP_LANG_KEY);
    } catch {
      /* localStorage 不可用时静默 */
    }
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // 初始固定为默认币种，与服务端渲染一致；水合后再从 cookie 同步，避免 hydration 报错
  const [code, setCodeState] = useState<string>(DEFAULT_CURRENCY);
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);

  useEffect(() => {
    let cancelled = false;
    setCodeState(readCookie());
    fetch("/api/currency/rates", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ data?: { rates?: Record<string, number> } }>) : null))
      .then((data) => {
        if (!cancelled && data?.data?.rates) setRates({ ...FALLBACK_RATES, ...data.data.rates });
      })
      .catch(() => {
        /* 保持内置汇率 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCode = useCallback(
    (next: string) => {
      const valid = parseCurrencyCode(next);
      setCodeState(valid);
      if (typeof document !== "undefined") {
        document.cookie = `${CURRENCY_COOKIE}=${valid}; path=/; max-age=31536000`;
        syncLangCookie(valid);
        // 同步 URL 语言前缀：CNY → 补 /zh；非 CNY → 去掉 /zh|/en 前缀。
        // 否则停留在 /zh 页面切 USD 时，URL 仍粘着 /zh，路由级 x-lang 会持续注入 zh。
        const path = window.location.pathname;
        const suffix = window.location.search + window.location.hash;
        const wantsZh = valid.toUpperCase() === "CNY";
        const hasZh = /^\/zh(?=\/|$)/.test(path);
        const hasPrefix = /^\/(zh|en)(?=\/|$)/.test(path);
        const strip = () => path.replace(/^\/(zh|en)(?=\/|$)/, "") || "/";
        if (wantsZh) {
          if (!hasZh) {
            const base = strip();
            router.replace(`${base === "/" ? "/zh" : `/zh${base}`}${suffix}`);
          }
        } else if (hasPrefix) {
          router.replace(`${strip()}${suffix}`);
        }
      }
      // 无论是否变更 URL 前缀，都再 refresh 一次：
      // replace 到「经 proxy rewrite 后同一路由」的 URL 时，客户端路由缓存可能复用旧 RSC，
      // 导致语言/价格仍是旧值（需硬刷新才生效）。refresh 强制按新 cookie 重新拉取服务端渲染。
      router.refresh();
    },
    [router],
  );

  const value = useMemo<CurrencyContextValue>(() => {
    const def = getCurrencyDef(code);
    const rate = rates[code] ?? 1;
    return {
      def,
      code,
      rate,
      format: (amountBase: number) => formatAmount(convertPrice(amountBase, rate), code),
      setCode,
    };
  }, [code, rates, setCode]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return ctx;
}

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
      }
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

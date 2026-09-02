"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT, useShopLang } from "@/components/shop/lang-provider";

interface FavoritesContextValue {
  isFavorited: (productId: string) => boolean;
  toggle: (productId: string) => Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/** 收藏状态 Provider：登录后一次性加载收藏集，全站心形按钮共享
 *  收藏 = 关注 = 降价通知订阅（见 Favorite.lang → PriceAlert.lang 1:1） */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorited, setFavorited] = useState<Set<string>>(new Set());
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { lang } = useShopLang();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    apiFetch<{ favorites: { productId: string }[] }>("/api/user/favorites")
      .then((r) => setFavorited(new Set((r.favorites ?? []).map((f) => f.productId))))
      .catch(() => {
        /* 未登录 401 忽略 */
      });
  }, []);

  const isFavorited = useCallback((productId: string) => favorited.has(productId), [favorited]);

  const toggle = useCallback(
    async (productId: string) => {
      // 乐观更新：先翻状态，请求失败时回滚（体验立刻响应 + 失败时还原）
      let prev: boolean | null = null;
      setFavorited((p) => {
        prev = p.has(productId);
        const next = new Set(p);
        if (prev) next.delete(productId);
        else next.add(productId);
        return next;
      });
      try {
        const r = await apiFetch<{ favorited: boolean }>(`/api/user/favorites/${productId}`, {
          method: "POST",
          body: JSON.stringify({ lang }),
        });
        // 同步服务端实际结果（处理并发场景：另一端已切状态）
        setFavorited((p) => {
          const next = new Set(p);
          if (r.favorited) next.add(productId);
          else next.delete(productId);
          return next;
        });
        if (r.favorited) {
          // 友好提示：收藏同时订阅了降价通知
          toast.success(t("Saved — we'll notify you on price drops"));
        }
        return r.favorited;
      } catch (err) {
        // 回滚到原状态
        setFavorited((p) => {
          const next = new Set(p);
          if (prev) next.add(productId);
          else next.delete(productId);
          return next;
        });
        const msg = err instanceof Error ? err.message : "";
        if (/登录|login/i.test(msg)) {
          router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
        } else {
          toast.error(err instanceof Error ? err.message : t("Operation failed"));
        }
        return false;
      }
    },
    [pathname, router, t, lang],
  );

  return (
    <FavoritesContext.Provider value={{ isFavorited, toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites 必须在 FavoritesProvider 内使用");
  return ctx;
}

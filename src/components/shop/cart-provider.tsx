"use client";

/**
 * Shopping Bag全局状态(Context)：
 * - 已登录：数据来自服务端 /api/cart(登录态以 /api/auth/me 判断)
 * - 未登录：读取 localStorage 'guest_cart'([{ productId, quantity }])，
 *   商品信息通过公开接口 /api/cart/preview 批量补全
 * - 监听 auth:login：合并游客Shopping Bag到服务端；auth:logout：切回游客模式
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetch-client";
import { MAX_CART_ITEM_QUANTITY, MAX_CART_ITEMS, LOGGED_IN_COOKIE } from "@/lib/constants";
import { specKey, type SpecSelection } from "@/components/shop/types";
// 纯函数（无 server-only）：组合可售量与登录用户（getCart→specAvailableQuantity）、
// 下单扣减同一口径；游客购物袋不再回落商品总库存
import { variantAvailableQuantity } from "@/server/services/variant-stock";

/** 是否已登录（读服务端登录时写入的 JS 可读提示 cookie），避免未登录时去打 /api/auth/me 造成 401 控制台噪音 */
function hasLoggedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${LOGGED_IN_COOKIE}=`));
}

import { useShopLang } from "@/components/shop/lang-provider";
/** Shopping Bag条目(客户端形态，与服务端 cart.service.CartLine 对齐) */
export interface CartLine {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  price: number;
  stock: number;
  status: string;
  quantity: number;
  subtotal: number;
  isPresale?: boolean;
  attributes?: SpecSelection[];
  attributesKey: string;
}

interface GuestEntry {
  productId: string;
  quantity: number;
  attributes?: SpecSelection[];
}

/** /api/cart/preview 返回的商品行 */
interface PreviewProduct {
  id: string;
  name: string;
  slug: string;
  images: string[] | null;
  price: number | string;
  stock: number;
  status: string;
  isPresale: boolean;
  /** 组合明细（仅 active）：按所选规格算组合可售量（与登录用户同口径） */
  variants?: { attributes: { name: string; value: string }[]; stock: number }[] | null;
}

interface CartContextValue {
  items: CartLine[];
  count: number;
  subtotal: number;
  loading: boolean;
  /** 是否已登录(服务端Shopping Bag) */
  isLoggedIn: boolean;
  refresh: () => Promise<void>;
  addToCart: (
    productId: string,
    quantity?: number,
    attributes?: SpecSelection[],
    opts?: { stock?: number; isPresale?: boolean },
  ) => Promise<void>;
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  removeItem: (cartItemId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const GUEST_KEY = "guest_cart";

const CartContext = createContext<CartContextValue | null>(null);

function readGuestEntries(): GuestEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is GuestEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as GuestEntry).productId === "string" &&
          typeof (e as GuestEntry).quantity === "number",
      )
      .map((e) => ({
        productId: e.productId,
        quantity: Math.min(Math.max(1, Math.floor(e.quantity)), MAX_CART_ITEM_QUANTITY),
        attributes: Array.isArray(e.attributes)
          ? e.attributes.filter(
              (a): a is SpecSelection =>
                !!a &&
                typeof a === "object" &&
                typeof a.name === "string" &&
                typeof a.value === "string",
            )
          : undefined,
      }));
  } catch {
    return [];
  }
}

function writeGuestEntries(entries: GuestEntry[]): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(entries));
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 游客Shopping Bag行的本地 ID(productId + 规格键) */
function guestLineId(entry: GuestEntry): string {
  return `${entry.productId}::${specKey(entry.attributes)}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { t } = useShopLang();

  const [items, setItems] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  /** 加载游客Shopping Bag：localStorage 条目 + preview 补全商品信息 */
  const loadGuest = useCallback(async (entries?: GuestEntry[]) => {
    const list = entries ?? readGuestEntries();
    if (list.length === 0) {
      setItems([]);
      return;
    }
    const ids = [...new Set(list.map((e) => e.productId))].join(",");
    try {
      const data = await apiFetch<{ products: PreviewProduct[] }>(
        `/api/cart/preview?ids=${encodeURIComponent(ids)}`,
      );
      const map = new Map((data.products ?? []).map((p) => [p.id, p]));
      const lines: CartLine[] = [];
      for (const entry of list) {
        const p = map.get(entry.productId);
        if (!p) continue;
        const price = Number(p.price);
        lines.push({
          id: guestLineId(entry),
          productId: p.id,
          name: p.name,
          slug: p.slug,
          image: Array.isArray(p.images) ? (p.images[0] ?? null) : null,
          price: Number.isNaN(price) ? 0 : price,
          // 行级库存 = 该行规格的**组合可售量**（与 fetchGuestCartLines/登录用户同口径）：
          // 商品总库存是全部组合之和，回落会让售罄组合在游客端显示有货
          stock: variantAvailableQuantity(p.variants, entry.attributes ?? [], p.stock),
          status: p.status,
          isPresale: p.isPresale,
          quantity: entry.quantity,
          subtotal: round2((Number.isNaN(price) ? 0 : price) * entry.quantity),
          attributes: entry.attributes,
          attributesKey: specKey(entry.attributes),
        });
      }
      setItems(lines);
    } catch (err) {
      // warn 而非 error：DB 不可达时是预期降级，不应让浏览器 console 红字
      console.warn("Failed to load guest cart", err);
      setItems([]);
    }
  }, []);

  /** 加载Shopping Bag：优先服务端，401 时回退游客模式 */
  const load = useCallback(async () => {
    setLoading(true);
    // 未登录（无 JS 可读 logged_in cookie）→ 直接游客模式，避免 /api/auth/me 401 控制台噪音
    if (!hasLoggedInCookie()) {
      setIsLoggedIn(false);
      await loadGuest();
      setLoading(false);
      return;
    }
    try {
      await apiFetch<{ user: { id: string } }>("/api/auth/me");
      setIsLoggedIn(true);
      // 兜底：若登录请求期间已产生游客条目(竞态)，合并进服务端Shopping Bag
      const guest = readGuestEntries();
      if (guest.length > 0) {
        try {
          await apiFetch("/api/cart/merge", {
            method: "POST",
            body: JSON.stringify({ items: guest }),
          });
          localStorage.removeItem(GUEST_KEY);
        } catch {
          /* 合并失败不阻塞Shopping Bag加载 */
        }
      }
      try {
        const cart = await apiFetch<{ items: CartLine[]; count: number; subtotal: number }>(
          "/api/cart",
        );
        setItems(cart.items ?? []);
      } catch (err) {
        console.warn("Failed to load server-side cart", err);
        setItems([]);
      }
    } catch {
      // 未登录(401)或会话失效 → 游客模式
      setIsLoggedIn(false);
      await loadGuest();
    } finally {
      setLoading(false);
    }
  }, [loadGuest]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 登录 / 登出事件同步(由登录页、退出登录按钮 dispatch) */
  useEffect(() => {
    const onLogin = () => {
      const guest = readGuestEntries();
      if (guest.length > 0) {
        apiFetch("/api/cart/merge", {
          method: "POST",
          body: JSON.stringify({ items: guest }),
        })
          .then(() => localStorage.removeItem(GUEST_KEY))
          .catch((err: Error) => toast.error(err.message))
          .finally(() => void load());
      } else {
        void load();
      }
    };
    const onLogout = () => {
      setIsLoggedIn(false);
      void loadGuest();
    };
    window.addEventListener("auth:login", onLogin);
    window.addEventListener("auth:logout", onLogout);
    return () => {
      window.removeEventListener("auth:login", onLogin);
      window.removeEventListener("auth:logout", onLogout);
    };
  }, [load, loadGuest]);

  const addToCart = useCallback(
    async (
      productId: string,
      quantity = 1,
      attributes?: SpecSelection[],
      opts?: { stock?: number; isPresale?: boolean },
    ) => {
      const qty = Math.min(Math.max(1, Math.floor(quantity)), MAX_CART_ITEM_QUANTITY);
      if (isLoggedIn) {
        await apiFetch("/api/cart", {
          method: "POST",
          body: JSON.stringify({
            productId,
            quantity: qty,
            attributes: attributes && attributes.length > 0 ? attributes : undefined,
          }),
        });
        toast.success(t("Added to bag"));
        void load();
      } else {
        const list = readGuestEntries();
        // 边界审计补齐：登录车服务端限 MAX_CART_ITEMS 条，游客端此前无检查——
        // 超限后下单被 items max 拒且报错文案不友好。加购前置闸门，同口径。
        if (
          !list.some(
            (e) => e.productId === productId && specKey(e.attributes) === specKey(attributes),
          ) &&
          list.length >= MAX_CART_ITEMS
        ) {
          throw new Error(
            t("Shopping bag is full (max {n} items). Remove some items first.", {
              n: MAX_CART_ITEMS,
            }),
          );
        }
        const existing = list.find(
          (e) => e.productId === productId && specKey(e.attributes) === specKey(attributes),
        );
        // 大爷需求：游客加购也即时校验库存（已登录走服务端校验），不足当场提示，不等结账
        const newQty = Math.min((existing?.quantity ?? 0) + qty, MAX_CART_ITEM_QUANTITY);
        if (opts?.stock !== undefined && !opts.isPresale && newQty > opts.stock) {
          throw new Error(t("Insufficient stock, only {n} left", { n: opts.stock }));
        }
        if (existing) {
          existing.quantity = newQty;
        } else {
          list.push({
            productId,
            quantity: qty,
            attributes: attributes && attributes.length > 0 ? attributes : undefined,
          });
        }
        writeGuestEntries(list);
        toast.success(t("Added to bag"));
        await loadGuest(list);
      }
    },
    [isLoggedIn, load, loadGuest, t],
  );

  const updateQuantity = useCallback(
    async (cartItemId: string, quantity: number) => {
      const qty = Math.min(Math.max(1, Math.floor(quantity)), MAX_CART_ITEM_QUANTITY);
      if (isLoggedIn) {
        await apiFetch(`/api/cart/${cartItemId}`, {
          method: "PUT",
          body: JSON.stringify({ quantity: qty }),
        });
        void load();
      } else {
        const list = readGuestEntries();
        const entry = list.find((e) => guestLineId(e) === cartItemId);
        if (!entry) return;
        // 大爷需求：游客改数量也即时校验库存（行数据带 stock），不足当场提示
        const line = items.find((l) => l.id === cartItemId);
        if (line && !line.isPresale && qty > line.stock) {
          toast.error(t("Insufficient stock, only {n} left", { n: line.stock }));
          return;
        }
        entry.quantity = qty;
        writeGuestEntries(list);
        await loadGuest(list);
      }
    },
    [isLoggedIn, load, loadGuest, items, t],
  );

  const removeItem = useCallback(
    async (cartItemId: string) => {
      if (isLoggedIn) {
        await apiFetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
        void load();
      } else {
        const list = readGuestEntries().filter((e) => guestLineId(e) !== cartItemId);
        writeGuestEntries(list);
        await loadGuest(list);
      }
    },
    [isLoggedIn, load, loadGuest],
  );

  const clear = useCallback(async () => {
    if (isLoggedIn) {
      await apiFetch("/api/cart", { method: "DELETE" });
      void load();
    } else {
      localStorage.removeItem(GUEST_KEY);
      setItems([]);
    }
  }, [isLoggedIn, load]);

  const { count, subtotal } = useMemo(() => {
    let c = 0;
    let s = 0;
    for (const line of items) {
      c += line.quantity;
      s += line.subtotal;
    }
    return { count: c, subtotal: round2(s) };
  }, [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count,
      subtotal,
      loading,
      isLoggedIn,
      refresh: load,
      addToCart,
      updateQuantity,
      removeItem,
      clear,
    }),
    [
      items,
      count,
      subtotal,
      loading,
      isLoggedIn,
      load,
      addToCart,
      updateQuantity,
      removeItem,
      clear,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}

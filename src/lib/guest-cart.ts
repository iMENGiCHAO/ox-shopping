"use client";

/**
 * 游客（未登录）购物车公共模块。
 *
 * 原站 shop.x.com 结账页是 Shopify checkout：**不登录也能加购并下单**。
 * 本项目游客车存放在 localStorage('guest_cart')，商品信息用公开接口
 * `/api/cart/preview` 批量补全——由购物袋 Context（cart-provider）与本模块共用，
 * 避免结账页重复实现（结账页在独立的 (checkout) 路由组，不挂 CartProvider）。
 */
import { apiFetch } from "@/lib/fetch-client";
import { MAX_CART_ITEM_QUANTITY, LOGGED_IN_COOKIE } from "@/lib/constants";
import { specKey, type SpecSelection } from "@/components/shop/types";
import type { CartLine } from "@/components/shop/cart-provider";

export const GUEST_KEY = "guest_cart";

/**
 * 是否已登录：读服务端登录时写入的 JS 可读提示 cookie。
 * 避免未登录时去打 /api/cart 等需鉴权接口造成 401 控制台噪音。
 */
export function hasLoggedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${LOGGED_IN_COOKIE}=`));
}

/** 游客车条目（仅存商品 id + 数量 + 规格，商品详情实时从 preview 拉取） */
export interface GuestEntry {
  productId: string;
  quantity: number;
  attributes?: SpecSelection[];
}

/** 游客车行的本地 ID(productId + 规格键)，与服务端行 id 语义对齐 */
export function guestLineId(entry: GuestEntry): string {
  return `${entry.productId}::${specKey(entry.attributes)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 读取游客车条目（损坏数据静默丢弃；隐私模式下返回空） */
export function readGuestEntries(): GuestEntry[] {
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

export function writeGuestEntries(entries: GuestEntry[]): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(entries));
  } catch {
    /* 隐私模式等场景忽略 */
  }
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
}

/**
 * 拉取游客购物车行（本地条目 + 公开接口补全商品信息）。
 * 返回结构与服务端 `/api/cart` 的 items 对齐，供购物袋与结账页共用。
 */
export async function fetchGuestCartLines(entries?: GuestEntry[]): Promise<CartLine[]> {
  const list = entries ?? readGuestEntries();
  if (list.length === 0) return [];
  const ids = [...new Set(list.map((e) => e.productId))].join(",");
  const data = await apiFetch<{ products: PreviewProduct[] }>(
    `/api/cart/preview?ids=${encodeURIComponent(ids)}`,
  );
  const map = new Map((data.products ?? []).map((p) => [p.id, p]));
  const lines: CartLine[] = [];
  for (const entry of list) {
    const p = map.get(entry.productId);
    if (!p) continue; // 商品已下架/删除：跳过该行
    const price = Number(p.price);
    const safePrice = Number.isNaN(price) ? 0 : price;
    lines.push({
      id: guestLineId(entry),
      productId: p.id,
      name: p.name,
      slug: p.slug,
      image: Array.isArray(p.images) ? (p.images[0] ?? null) : null,
      price: safePrice,
      stock: p.stock,
      status: p.status,
      quantity: entry.quantity,
      subtotal: round2(safePrice * entry.quantity),
      attributes: entry.attributes,
      attributesKey: specKey(entry.attributes),
    });
  }
  return lines;
}

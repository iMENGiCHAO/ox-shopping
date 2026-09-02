import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_CART_ITEM_QUANTITY, MAX_CART_ITEMS } from "@/lib/constants";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import type { SpecSelection } from "@/components/shop/types";

/** Shopping Bag服务：游客本地Shopping Bag → 登录后合并到服务端 */

export type { SpecSelection };

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
  /** 规格去重键(区分同商品不同规格的Shopping Bag行) */
  attributesKey: string;
}

export interface LocalCartLine {
  productId: string;
  quantity: number;
  attributes?: SpecSelection[];
}

/** 规范化规格选择 → 去重键 */
export function specKey(attributes?: SpecSelection[] | null): string {
  if (!attributes || attributes.length === 0) return "";
  return JSON.stringify([...attributes].sort((a, b) => a.name.localeCompare(b.name)));
}

/** 解析商品可选规格组：name → Set(values) */
export function selectableSpecs(productAttributes: unknown): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!Array.isArray(productAttributes)) return map;
  for (const item of productAttributes) {
    if (!item || typeof item !== "object") continue;
    const group = item as { name?: unknown; values?: unknown; selectable?: unknown };
    const name = typeof group.name === "string" ? group.name.trim() : "";
    if (!name || !Array.isArray(group.values)) continue;
    const values = group.values.filter((v): v is string => typeof v === "string" && v.length > 0);
    // 与店面 parseAttributes 口径一致：未显式标注 selectable 时，多值组默认可选
    const isSelectable =
      group.selectable === undefined || group.selectable === null
        ? values.length > 1
        : group.selectable === true;
    if (!isSelectable || values.length === 0) continue;
    map.set(name, new Set(values));
  }
  return map;
}

/** 校验规格选择是否属于商品的可选规格组 */
export function assertValidSpecs(
  productAttributes: unknown,
  attributes?: SpecSelection[] | null,
): void {
  if (!attributes || attributes.length === 0) return;
  const selectable = selectableSpecs(productAttributes);
  for (const s of attributes) {
    const values = selectable.get(s.name.trim());
    if (!values) throw badRequest(`规格「${s.name}」不是该商品的可选规格`);
    if (!values.has(s.value)) throw badRequest(`规格「${s.name}」的值「${s.value}」无效`);
  }
}

export async function getCart(
  userId: string,
): Promise<{ items: CartLine[]; count: number; subtotal: number }> {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const lines: CartLine[] = [];
  for (const item of items) {
    if (!item.product) continue;
    lines.push({
      id: item.id,
      productId: item.product.id,
      name: item.product.name,
      slug: item.product.slug,
      image: Array.isArray(item.product.images)
        ? ((item.product.images[0] as string) ?? null)
        : null,
      price: Number(item.product.price),
      stock: item.product.stock,
      status: item.product.status,
      quantity: item.quantity,
      subtotal: round2(Number(item.product.price) * item.quantity),
      isPresale: item.product.isPresale,
      attributes: Array.isArray(item.attributes)
        ? (item.attributes as unknown as SpecSelection[])
        : undefined,
      attributesKey: item.attributesKey,
    });
  }

  return {
    items: lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: round2(lines.reduce((s, l) => s + l.subtotal, 0)),
  };
}

export async function addToCart(
  userId: string,
  productId: string,
  quantity: number,
  attributes?: SpecSelection[],
): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.status !== "ACTIVE") throw notFound("商品不存在或已下架");
  assertValidSpecs(product.attributes, attributes);

  const key = specKey(attributes);

  const existing = await prisma.cartItem.findUnique({
    where: { userId_productId_attributesKey: { userId, productId, attributesKey: key } },
  });

  const newQuantity = Math.min((existing?.quantity ?? 0) + quantity, MAX_CART_ITEM_QUANTITY);
  // 预售商品允许 0 库存下单(Pre-Order)；普通商品仍按库存校验
  if (!product.isPresale && newQuantity > product.stock) {
    throw badRequest(`库存不足，当前仅剩 ${product.stock} 件`);
  }

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } });
  } else {
    const count = await prisma.cartItem.count({ where: { userId } });
    if (count >= MAX_CART_ITEMS) throw badRequest(`Shopping Bag最多 ${MAX_CART_ITEMS} 种商品`);
    await prisma.cartItem.create({
      data: {
        userId,
        productId,
        quantity: Math.min(quantity, MAX_CART_ITEM_QUANTITY),
        attributes:
          attributes && attributes.length > 0
            ? (attributes as unknown as Prisma.InputJsonValue)
            : undefined,
        attributesKey: key,
      },
    });
  }
}

export async function updateCartItem(
  userId: string,
  cartItemId: string,
  quantity: number,
): Promise<void> {
  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } });
  if (!item) throw notFound("Shopping Bag条目不存在");
  const product = await prisma.product.findUnique({ where: { id: item.productId } });
  // 预售商品不受库存上限约束(Pre-Order)
  if (!product?.isPresale && quantity > (product?.stock ?? 0)) {
    throw badRequest(`库存不足，当前仅剩 ${product?.stock ?? 0} 件`);
  }
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
}

export async function removeCartItem(userId: string, cartItemId: string): Promise<void> {
  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } });
  if (!item) throw notFound("Shopping Bag条目不存在");
  await prisma.cartItem.delete({ where: { id: item.id } });
}

export async function clearCart(userId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { userId } });
}

/** 登录后合并游客本地Shopping Bag(幂等：同商品数量相加并封顶) */
export async function mergeLocalCart(userId: string, local: LocalCartLine[]): Promise<void> {
  const productIds = local.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: "ACTIVE" },
  });
  // 同时携带 stock 与 isPresale，预售 stock=0 仍允许加购
  const productInfo = new Map(products.map((p) => [p.id, { stock: p.stock, isPresale: p.isPresale }]));

  for (const line of local) {
    const info = productInfo.get(line.productId);
    // 修复：原 `!stock` 会把预售 stock=0 误判为下架；现在按"存在"判断，下架/不存在的商品才跳过
    if (!info) continue;
    const key = specKey(line.attributes);
    const existing = await prisma.cartItem.findUnique({
      where: {
        userId_productId_attributesKey: {
          userId,
          productId: line.productId,
          attributesKey: key,
        },
      },
    });
    // 预售：不受库存上限约束；普通商品按 stock 封顶
    const cap = info.isPresale ? MAX_CART_ITEM_QUANTITY : Math.min(MAX_CART_ITEM_QUANTITY, info.stock);
    const merged = Math.min((existing?.quantity ?? 0) + line.quantity, cap);
    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: merged } });
    } else {
      await prisma.cartItem.create({
        data: {
          userId,
          productId: line.productId,
          quantity: Math.max(merged, 1),
          attributes:
            line.attributes && line.attributes.length > 0
              ? (line.attributes as unknown as Prisma.InputJsonValue)
              : undefined,
          attributesKey: key,
        },
      });
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toPrismaDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_CART_ITEM_QUANTITY, MAX_CART_ITEMS } from "@/lib/constants";
import { MAX_PRESALE_QTY } from "@/lib/inventory";
import { pickName, type Lang } from "@/lib/shop-i18n";
import { badRequest, notFound } from "@/lib/errors";
import type { SpecSelection } from "@/components/shop/types";
import {
  effectiveUnitPrice,
  parseVariantAttributes,
  variantAvailableQuantity,
  type VariantLike,
} from "@/server/services/variant-stock";

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
    if (!values) throw badRequest(`Option "${s.name}" is not available for this product`);
    if (!values.has(s.value)) throw badRequest(`Option "${s.name}" value "${s.value}" is invalid`);
  }
}

/**
 * 该规格组合的**可售库存**（判断库存必须先过这一步；大爷 2026-09-29 全链路统一）：
 * - 变体模式（variants 非空，父组×子组组合粒度）→ 按签名定位所选组合：
 *   组合不存在 / 已下架 / 库存 0 → 0。绝不能回落总库存 —— 总库存是全部组合
 *   之和，回落会让「黑/S 售罄但白/M 有货」的售罄组合被加进购物车、下单才报错。
 * - 非变体模式且配置了 specStock（维度池存量兼容）→ 规格明细库存；
 *   组存在但没有该值的记录 → 已售罄（0）。
 * - 非变体模式且未配置 specStock / 未选规格 → 商品总库存。
 * - 预售商品（isPresale）不受库存上限约束 → 返回 Infinity，调用方不会拦。
 */
export function specAvailableQuantity(
  product: { stock: number; isPresale?: boolean | null; specStock?: unknown },
  attributes?: SpecSelection[] | null,
  variants?: VariantLike[] | null,
): number {
  if (product.isPresale) return Infinity;
  if (variants && variants.length > 0) {
    return variantAvailableQuantity(variants, attributes ?? [], product.stock);
  }
  const raw = product.specStock;
  if (!raw || typeof raw !== "object") return product.stock;
  const map = raw as Record<string, unknown>;
  const specs = Array.isArray(attributes) ? attributes : [];
  if (specs.length === 0) return product.stock;
  for (const s of specs) {
    const group = map[s.name];
    if (group && typeof group === "object") {
      const v = (group as Record<string, unknown>)[s.value];
      const n = typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN;
      if (Number.isFinite(n)) return Math.max(0, n);
      // 组存在但该规格值没有库存记录 → 已售罄
      return 0;
    }
    // 组不存在（specStock 结构不含该维度）→ 回落总库存
    return product.stock;
  }
  return product.stock;
}

/** 批量取一组商品的 active 变体（组合粒度库存真相），Map 缺项 = 无变体 */
export async function loadActiveVariants(
  productIds: string[],
): Promise<Map<string, VariantLike[]>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.productVariant.findMany({
    where: { productId: { in: ids }, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, VariantLike[]>();
  for (const v of rows) {
    const list = out.get(v.productId) ?? [];
    list.push({
      id: v.id,
      attributes: parseVariantAttributes(v.attributes),
      stock: v.stock,
      isActive: v.isActive,
      // 组合覆盖价（资金审计 H1）：购物车行价/小计按所选组合的真实价格
      price: v.price == null ? null : Number(v.price),
    });
    out.set(v.productId, list);
  }
  return out;
}

export async function getCart(
  userId: string,
  /** 请求语种（P2-1）：商品名按语种挑（nameEn 优先于英文界面）；缺省回退中文名 */
  lang: Lang = "zh",
): Promise<{ items: CartLine[]; count: number; subtotal: number }> {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });

  // 行级库存 = 该行规格的**组合可售量**（变体模式按所选组合；单规格即总库存）：
  // 购物车页的「售罄」标灰与数量上限都以此为准 —— 用商品总库存会让
  // 「黑/S 售罄但白/M 有货」的行显示有货、可超卖加量（前后端数据贯通）
  const variantsByProduct = await loadActiveVariants(items.map((i) => i.productId));

  const lines: CartLine[] = [];
  for (const item of items) {
    if (!item.product) continue;
    // 行级生效单价（资金审计 H1）：变体覆盖价 ?? 商品价 ——
    // 购物车页/抽屉/结账摘要显示的价格必须与下单实扣一致
    const lineAttributes = Array.isArray(item.attributes)
      ? (item.attributes as unknown as SpecSelection[])
      : null;
    const unitPrice = effectiveUnitPrice(
      item.product.price,
      variantsByProduct.get(item.productId) ?? null,
      lineAttributes,
    );
    lines.push({
      id: item.id,
      productId: item.product.id,
      // 商品名按请求语种挑（P2-1 商用审计）：双语数据（name=zh、nameEn=en）下
      // 英文用户在购物车/结账/订单快照看中文名，而 PDP/PLP 是英文名 ——
      // 这里是购物车/抽屉/结账三处的单一修复点（都渲染 line.name）
      name: pickName(item.product.name, item.product.nameEn ?? null, lang),
      slug: item.product.slug,
      image: Array.isArray(item.product.images)
        ? ((item.product.images[0] as string) ?? null)
        : null,
      price: unitPrice,
      stock: specAvailableQuantity(
        item.product,
        lineAttributes,
        variantsByProduct.get(item.productId) ?? null,
      ),
      status: item.product.status,
      quantity: item.quantity,
      subtotal: round2(unitPrice * item.quantity),
      isPresale: item.product.isPresale,
      attributes: lineAttributes ?? undefined,
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
  if (!product || product.status !== "ACTIVE") throw notFound("Product not found or no longer available");
  assertValidSpecs(product.attributes, attributes);

  const key = specKey(attributes);

  const existing = await prisma.cartItem.findUnique({
    where: { userId_productId_attributesKey: { userId, productId, attributesKey: key } },
  });

  const newQuantity = Math.min((existing?.quantity ?? 0) + quantity, MAX_CART_ITEM_QUANTITY);
  // 判断库存的唯一口径：组合粒度可售量（变体模式按所选组合；未配规格即总库存；
  // 预售 Infinity 不拦）——组合不存在/售罄在加购入口就拦住，不等下单才报错
  const [variants] = await Promise.all([loadActiveVariants([productId])]);
  // 变体商品必须选组合（P2-2 商用审计）：无规格行在变体商品上是「死行」——
  // 可售量恒 0（组合粒度无此对象），行标缺货、阻断结账，只能删除重加；
  // 旧版无规格游客条目合并后就会产生这种行。加购入口直接拒绝并指明原因。
  if ((variants.get(productId)?.length ?? 0) > 0 && (!attributes || attributes.length === 0)) {
    throw badRequest(
      "Please select the available options (e.g. color/size) before adding to the bag",
    );
  }
  const available = specAvailableQuantity(product, attributes, variants.get(productId) ?? null);
  if (!product.isPresale && newQuantity > available) {
    throw badRequest(`Not enough stock — only ${available} left`);
  }

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } });
  } else {
    const count = await prisma.cartItem.count({ where: { userId } });
    if (count >= MAX_CART_ITEMS) throw badRequest(`Your Shopping Bag can hold at most ${MAX_CART_ITEMS} different items`);
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
  if (!item) throw notFound("Shopping Bag item not found");
  const product = await prisma.product.findUnique({ where: { id: item.productId } });
  // 与 addToCart 同口径：按该行规格的**组合粒度**可售量校验（预售不受约束）——
  // 变体模式若回落总库存，售罄组合会在购物车里被改成超卖数量
  const variants = await loadActiveVariants([item.productId]);
  const available = specAvailableQuantity(
    { stock: product?.stock ?? 0, isPresale: product?.isPresale, specStock: product?.specStock },
    item.attributes as SpecSelection[] | null,
    variants.get(item.productId) ?? null,
  );
  if (!product?.isPresale && quantity > available) {
    throw badRequest(`Not enough stock — only ${available} left`);
  }
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
}

export async function removeCartItem(userId: string, cartItemId: string): Promise<void> {
  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId } });
  if (!item) throw notFound("Shopping Bag item not found");
  await prisma.cartItem.delete({ where: { id: item.id } });
}

export async function clearCart(userId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { userId } });
}

/** 登录后合并游客本地Shopping Bag(幂等：同商品数量相加并封顶) */
export async function mergeLocalCart(userId: string, local: LocalCartLine[]): Promise<void> {
  const productIds = local.map((l) => l.productId);
  const [products, variantsByProduct] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, status: "ACTIVE" },
    }),
    // 组合粒度可售量（与 addToCart/updateCartItem 同口径）：合并封顶按所选
    // 组合的库存，而不是商品总库存 —— 否则售罄组合合并后超卖
    loadActiveVariants(productIds),
  ]);
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
    // 预售：不受库存上限约束；普通商品按**该行规格的组合可售量**封顶
    const available = specAvailableQuantity(
      info,
      line.attributes as SpecSelection[] | null,
      variantsByProduct.get(line.productId) ?? null,
    );
    const stockCap = Number.isFinite(available) ? available : MAX_CART_ITEM_QUANTITY;
    // 预售：不受库存上限约束，但受「单预售商品最多 5 件」业务规则约束
    // （P1-3 商用审计：lib/inventory 单一事实来源，与 PDP/购物车页/抽屉/下单同口径）
    const cap = info.isPresale
      ? Math.min(MAX_CART_ITEM_QUANTITY, MAX_PRESALE_QTY)
      : Math.min(MAX_CART_ITEM_QUANTITY, stockCap);
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

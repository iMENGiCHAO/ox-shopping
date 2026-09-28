/**
 * SKU 矩阵（ProductVariant）纯函数工具 —— 与 spec-stock.ts 同风格（无 DB、可单测）。
 *
 * 为什么需要它：specStock 是「维度独立池」({ 颜色:{红:5}, 尺码:{M:3} })，无法表达
 *   ① 不同颜色有不同尺码范围（红只有 S/M，蓝才有 L）
 *   ② 每个「颜色×尺码」组合的独立库存
 * 变体模型把每个组合作为一条记录（含 signature 规范化键），前台按真实存在的组合
 * 过滤可选项 → 彻底消除「能选不能买」；下单/回补/到货提醒全部按组合粒度。
 *
 * 优先级：商品 variants 非空 → 变体模式；否则回落 specStock（维度池，兼容存量）。
 */

export interface VariantAttributes {
  name: string;
  value: string;
}

export interface VariantLike {
  id: string;
  attributes: VariantAttributes[];
  stock: number;
  isActive: boolean;
  price?: number | null;
  image?: string | null;
  sku?: string | null;
}

/** 宽松解析 DB Json 为属性数组（非法结构返回空数组） */
export function parseVariantAttributes(raw: unknown): VariantAttributes[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantAttributes[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = (item as { name?: unknown }).name;
    const value = (item as { value?: unknown }).value;
    if (typeof name === "string" && typeof value === "string" && name && value) {
      out.push({ name, value });
    }
  }
  return out;
}

/**
 * 组合签名：属性按 name 排序后拼 `名:值|名:值`——
 * 规范化保证「颜色在前/尺码在前」生成同一签名（唯一约束与下单定位的稳定键）。
 */
export function variantSignature(attrs: VariantAttributes[]): string {
  return attrs
    .filter((a) => a.name && a.value)
    .map((a) => ({ name: a.name.trim(), value: a.value.trim() }))
    .sort((a, b) => (a.name === b.name ? a.value.localeCompare(b.value) : a.name.localeCompare(b.name)))
    .map((a) => `${a.name}:${a.value}`)
    .join("|");
}

/** 把用户选择（属性数组或 {组:值} 映射）规整为属性数组 */
export function normalizeSelection(
  selection: VariantAttributes[] | Record<string, string>,
): VariantAttributes[] {
  if (Array.isArray(selection)) return selection;
  return Object.entries(selection).map(([name, value]) => ({ name, value }));
}

/** 在变体列表中定位所选组合（active 且签名匹配） */
export function findVariant<T extends VariantLike>(
  variants: T[],
  selection: VariantAttributes[] | Record<string, string>,
): T | null {
  const sig = variantSignature(normalizeSelection(selection));
  if (!sig) return null;
  return variants.find((v) => v.isActive && variantSignature(v.attributes) === sig) ?? null;
}

/**
 * 由变体列表推导「可选组与值」——前台选择器的真实可选项：
 * 只包含**至少存在一个 active 组合**的组/值（红色没有 L 组合 → L 不出现在红色的选项里）。
 * 返回顺序按首次出现顺序（与后台录入顺序一致）。
 */
export function selectableGroupsFromVariants(
  variants: VariantLike[],
): { name: string; values: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const v of variants) {
    if (!v.isActive) continue;
    for (const a of v.attributes) {
      const list = groups.get(a.name) ?? [];
      if (!list.includes(a.value)) list.push(a.value);
      groups.set(a.name, list);
    }
  }
  return [...groups.entries()].map(([name, values]) => ({ name, values }));
}

/**
 * 给定「已选中的部分属性」，返回某组当前可选的规格值集合 ——
 * 前台联动核心：选了「红色」后，尺码组只保留与红色共同存在的组合里的尺码。
 */
export function availableValuesFor(
  variants: VariantLike[],
  groupName: string,
  selected: VariantAttributes[] | Record<string, string> = [],
): string[] {
  const sel = normalizeSelection(selected).filter((a) => a.name !== groupName);
  const matched = variants.filter(
    (v) =>
      v.isActive &&
      sel.every((s) => v.attributes.some((a) => a.name === s.name && a.value === s.value)),
  );
  const values: string[] = [];
  for (const v of matched) {
    for (const a of v.attributes) {
      if (a.name === groupName && !values.includes(a.value)) values.push(a.value);
    }
  }
  return values;
}

/** 组合是否售罄（stock <= 0）——前台划线用 */
export function isVariantSoldOut(variant: VariantLike | null): boolean {
  return variant == null || variant.stock <= 0;
}

export interface VariantDeductionPlan {
  ok: boolean;
  /** 组合不存在 / 已下架 / 库存不足时的说明（ok=false 时有值） */
  reason?: "NOT_FOUND" | "SOLD_OUT" | "INSUFFICIENT";
  available: number;
  /** 实际扣减数量（预售可少于请求量） */
  deducted: number;
  /** 扣减后该变体的剩余库存 */
  nextStock: number;
}

/**
 * 组合粒度扣减：普通商品不足即失败；预售(allowShortfall)允许缺口扣 min(可用, qty)。
 */
export function planVariantDeduction(
  variant: VariantLike | null,
  qty: number,
  allowShortfall = false,
): VariantDeductionPlan {
  if (!variant) return { ok: false, reason: "NOT_FOUND", available: 0, deducted: 0, nextStock: 0 };
  const available = Math.max(0, Math.floor(variant.stock));
  if (available <= 0) {
    return allowShortfall
      ? { ok: true, available: 0, deducted: 0, nextStock: 0 }
      : { ok: false, reason: "SOLD_OUT", available: 0, deducted: 0, nextStock: 0 };
  }
  if (available < qty && !allowShortfall) {
    return { ok: false, reason: "INSUFFICIENT", available, deducted: 0, nextStock: available };
  }
  const deducted = Math.min(available, qty);
  return { ok: true, available, deducted, nextStock: available - deducted };
}

/** 变体模式的总可售量 = Σ active 变体库存 */
export function totalVariantStock(variants: VariantLike[]): number {
  return variants
    .filter((v) => v.isActive)
    .reduce((sum, v) => sum + Math.max(0, Math.floor(v.stock)), 0);
}

/** 变体模式下的价格区间（用于前台「起售价」展示） */
export function variantPriceRange(
  variants: VariantLike[],
  basePrice: number,
): { min: number; max: number } {
  const prices = variants
    .filter((v) => v.isActive)
    .map((v) => (v.price != null ? Number(v.price) : basePrice));
  if (prices.length === 0) return { min: basePrice, max: basePrice };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * 规格级库存(specStock)纯函数工具。
 * specStock 形如 { "Size": { "S": 3, "M": 0 } }；值为 0 = 该规格售罄；
 * 未出现在映射中的组/值 = 不追踪规格库存（视为可用）。
 *
 * 本文件保持纯净（无 server-only / 无 DB），便于单元测试覆盖边界。
 */

export type SpecStockMap = Record<string, Record<string, number>>;

/** 宽松解析 DB 中的 Json 字段为 SpecStockMap；非法结构返回空对象 */
export function parseSpecStock(raw: unknown): SpecStockMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: SpecStockMap = {};
  for (const [group, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const entry: Record<string, number> = {};
    for (const [value, count] of Object.entries(values as Record<string, unknown>)) {
      const n = typeof count === "number" ? count : Number(count);
      if (Number.isFinite(n)) entry[value] = Math.max(0, Math.floor(n));
    }
    out[group] = entry;
  }
  return out;
}

export interface SpecSelectionLike {
  name: string;
  value: string;
}

export interface SpecDeductionPlan {
  /** 是否满足扣减（allowShortfall=true 时恒为 true） */
  ok: boolean;
  /** 第一个不足的组/值（ok=false 时有值），用于报错文案 */
  shortage?: { group: string; value: string; available: number };
  /** 本次实际扣减映射 { "组名/值": n }（仅包含被追踪且发生扣减的条目） */
  deducted: Record<string, number>;
  /** 扣减后的新映射（可直接落库） */
  next: SpecStockMap;
}

/**
 * 计算并应用一次规格扣减：
 * - 普通商品：任一被追踪规格数量 < qty → ok=false（整单失败）
 * - 预售(allowShortfall=true)：允许缺口，实际扣 min(可用, qty)，下限 0
 */
export function planSpecDeduction(
  specRaw: unknown,
  attrs: SpecSelectionLike[] | undefined,
  qty: number,
  allowShortfall = false,
): SpecDeductionPlan {
  const spec = parseSpecStock(specRaw);
  const next: SpecStockMap = JSON.parse(JSON.stringify(spec));
  const deducted: Record<string, number> = {};

  for (const attr of attrs ?? []) {
    const tracked = spec[attr.name];
    // 未追踪该组/该值：不参与规格库存管理
    if (!tracked || !(attr.value in tracked)) continue;

    const available = tracked[attr.value] ?? 0;
    if (available < qty && !allowShortfall) {
      return {
        ok: false,
        shortage: { group: attr.name, value: attr.value, available },
        deducted,
        next,
      };
    }
    const take = Math.min(available, qty);
    next[attr.name]![attr.value] = available - take;
    deducted[`${attr.name}/${attr.value}`] = take;
  }

  return { ok: true, deducted, next };
}

/**
 * 整件库存与规格库存的一致性口径：
 * 总可售量 = min(每个被追踪组的规格之和)。任一维度的池都是上限，
 * 取最小值保证 Color×Size 任选组合都不会超卖（与下单扣减口径一致）。
 * 无任何被追踪数据时返回 null（表示未启用规格库存管理）。
 */
export function aggregateTrackedStock(specRaw: unknown): number | null {
  const spec = parseSpecStock(specRaw);
  const sums = Object.values(spec)
    .filter((m) => Object.keys(m).length > 0)
    .map((m) => Object.values(m).reduce((a, b) => a + b, 0));
  return sums.length > 0 ? Math.min(...sums) : null;
}

/** 取消订单时按记录精确回补规格库存 */
export function applySpecRestock(
  specRaw: unknown,
  deducted: Record<string, number> | null | undefined,
): SpecStockMap | null {
  if (!deducted || typeof deducted !== "object") return null;
  const entries = Object.entries(deducted).filter(
    ([, n]) => typeof n === "number" && n > 0,
  );
  if (entries.length === 0) return null;

  const spec = parseSpecStock(specRaw);
  for (const [key, n] of entries) {
    const slash = key.indexOf("/");
    if (slash <= 0) continue;
    const group = key.slice(0, slash);
    const value = key.slice(slash + 1);
    if (!spec[group]) spec[group] = {};
    const cur = spec[group][value];
    // 严格 NaN 防护：parseSpecStock 已过滤非法值，但保险起见再做一次类型守卫，
    // 避免上游异常（schema 漂移 / DB 脏数据）造成整张表被 NaN 污染。
    const safeCur = typeof cur === "number" && Number.isFinite(cur) ? Math.floor(cur) : 0;
    spec[group][value] = safeCur + Math.floor(n);
  }
  return spec;
}

import type { CommissionScope, DistributionConfig } from "@/lib/distribution/contract";

/**
 * 佣金计算（**纯函数**，无 IO）—— 分布式佣金最容易算错的地方，单独成层便于穷举单测。
 *
 * 口径（写在代码里，避免只活在文档里）：
 *   1. 计佣基数 = 订单**商品实付小计**（`subtotal - discount`），不含运费与税
 *      —— 运费是成本不是利润，把它算进佣金基数会直接返穿毛利；
 *   2. 逐级比例按 `depth` 查规则，乘积相加，**总比例封顶** `maxTotalRatio`
 *      （超过上限的层级直接跳过并停止向上，绝不截断单个金额造成"对不上账"）；
 *   3. 自购：下单人自己不出现在受益链里（见 `selfPurchase*` 两个开关）；
 *   4. 金额 < 0.01 的层级不产生流水（避免刷出大量一分钱记录）。
 */

export interface CommissionRuleLike {
  scopeType: string;
  scopeId: string | null;
  level: number;
  /** RATIO（比例）| FIXED（固定金额）；缺省按 RATIO 处理，兼容老数据 */
  mode?: string | null;
  ratio: number | string;
  /** mode=FIXED 时的固定金额（订单币种） */
  fixedAmount?: number | string | null;
  enabled: boolean;
  /** 生效期（含）；为空表示立即生效 */
  effectiveAt?: string | Date | null;
  /** 失效期（不含）；为空表示长期有效 */
  expireAt?: string | Date | null;
  /** 仅对指定等级的分销商生效（null/undefined = 通用） */
  tierLevel?: number | null;
}

/** 规则生效状态（纯函数：now 可注入，便于穷举单测） */
export function isRuleActive(rule: CommissionRuleLike, now: Date = new Date()): boolean {
  if (!rule.enabled) return false;
  if (rule.effectiveAt) {
    const from = new Date(rule.effectiveAt);
    if (!Number.isNaN(from.getTime()) && now.getTime() < from.getTime()) return false;
  }
  if (rule.expireAt) {
    const to = new Date(rule.expireAt);
    if (!Number.isNaN(to.getTime()) && now.getTime() >= to.getTime()) return false;
  }
  return true;
}

/** 解析后的规则口径（比例 / 固定金额） */
export interface ResolvedRule {
  mode: "RATIO" | "FIXED";
  ratio: number;
  fixedAmount: number;
}

/** 解析某一层级适用的规则（含生效期过滤）。未命中返回 null。 */
export function resolveRule(
  rules: CommissionRuleLike[],
  level: number,
  ctx: { categoryIds?: string[]; productIds?: string[]; tier?: number } = {},
  now: Date = new Date(),
): ResolvedRule | null {
  const usable = rules.filter((r) => isRuleActive(r, now) && r.level === level);
  if (usable.length === 0) return null;

  const tier = ctx.tier ?? 0;
  const pick = (scope: CommissionScope): CommissionRuleLike | undefined => {
    const inScope = usable.filter(
      (r) =>
        r.scopeType === scope &&
        (scope === "GLOBAL" ||
          (r.scopeId != null &&
            ((scope === "CATEGORY" && ctx.categoryIds?.includes(r.scopeId)) ||
              (scope === "PRODUCT" && ctx.productIds?.includes(r.scopeId))))),
    );
    /* 等级优先：同一个作用域里，**等级专用规则**覆盖通用规则。
       `tierLevel === 0` 也按通用处理（0 = 普通等级，等价于不区分等级）。 */
    const tierSpecific = inScope.find((r) => (r.tierLevel ?? 0) > 0 && r.tierLevel === tier);
    return tierSpecific ?? inScope.find((r) => !r.tierLevel || r.tierLevel === 0);
  };

  const hit = pick("PRODUCT") ?? pick("CATEGORY") ?? pick("GLOBAL");
  if (!hit) return null;

  const mode = hit.mode === "FIXED" ? "FIXED" : "RATIO";
  if (mode === "FIXED") {
    const fixed = Number(hit.fixedAmount ?? 0);
    if (!Number.isFinite(fixed) || fixed <= 0) return null;
    return { mode, ratio: 0, fixedAmount: round2(fixed) };
  }
  const ratio = Number(hit.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return { mode, ratio, fixedAmount: 0 };
}

/** 受益链上的一环（相对受益人的上级深度：1=直接上级） */
export interface AncestorNode {
  userId: string;
  depth: number;
  /** 该上级的分销商等级（0=普通）；不同等级可以命中不同比例的规则 */
  tier?: number;
}

export interface PlannedCommission {
  userId: string;
  level: number;
  /** RATIO 规则返回其比例；FIXED 规则返回 0 */
  ratio: number;
  amount: number;
}

/** 金额四舍五入到分（避免浮点尾数进账） */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 解析某一层级适用的比例。
 * 优先级：PRODUCT > CATEGORY > GLOBAL（越具体越优先）；同 scope 取 level 精确匹配。
 */
export function resolveRatio(
  rules: CommissionRuleLike[],
  level: number,
  ctx: { categoryIds?: string[]; productIds?: string[]; tier?: number } = {},
  now: Date = new Date(),
): number {
  return resolveRule(rules, level, ctx, now)?.ratio ?? 0;
}

/**
 * 规划一笔订单的逐级佣金。
 *
 * @param baseAmount 计佣基数（订单币种，商品实付小计）
 * @param ancestors  从**归属分销商**向上的链条（depth=1 是归属分销商本人）
 * @param buyerId    下单人 id（用于自购判定）；游客单为 null
 */
export function planCommissions(input: {
  baseAmount: number;
  ancestors: AncestorNode[];
  rules: CommissionRuleLike[];
  config: Pick<
    DistributionConfig,
    | "maxCommissionLevels"
    | "maxTotalRatio"
    | "selfPurchaseCommission"
    | "selfPurchaseCountForUpstream"
  >;
  buyerId?: string | null;
  categoryIds?: string[];
  productIds?: string[];
  /** 规则生效时间判定基准（默认 now；测试可注入） */
  now?: Date;
}): PlannedCommission[] {
  const { baseAmount, ancestors, rules, config, buyerId } = input;
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return [];

  const ordered = [...ancestors].sort((a, b) => a.depth - b.depth);
  const out: PlannedCommission[] = [];
  const now = input.now ?? new Date();
  const maxTotalAmount = round2((baseAmount * config.maxTotalRatio) / 100);
  let totalRatio = 0;
  let totalAmount = 0;

  for (const node of ordered) {
    // 超出配置的返佣层级：只记录关系，不返佣
    if (node.depth > config.maxCommissionLevels) break;

    // 自购：本人不出现在自己的受益链里
    if (buyerId && node.userId === buyerId) {
      if (!config.selfPurchaseCommission) continue;
      // 允许自购拿佣时，若上级也拿不到，则整条链到此为止
      if (!config.selfPurchaseCountForUpstream) break;
    }

    const rule = resolveRule(
      rules,
      node.depth,
      {
        ...(input.categoryIds ? { categoryIds: input.categoryIds } : {}),
        ...(input.productIds ? { productIds: input.productIds } : {}),
        tier: node.tier ?? 0,
      },
      now,
    );
    if (!rule) continue;

    /* 两种模式共用同一道「总上限」闸门：
       · RATIO：按比例累加判断（原有口径）；
       · FIXED：固定金额本身是绝对值，需要换算成等效比例来判断 —— 否则
         「固定 5 美元」在小额订单上会直接返穿毛利（20 美元的 25%）。
       任一模式超限即停止向上，绝不截断单个金额（截断会让账对不上）。 */
    if (rule.mode === "FIXED") {
      const amount = round2(rule.fixedAmount);
      if (amount < 0.01) continue;
      if (round2(totalAmount + amount) > maxTotalAmount) break;
      totalAmount = round2(totalAmount + amount);
      out.push({ userId: node.userId, level: node.depth, ratio: 0, amount });
      continue;
    }

    const ratio = rule.ratio;
    if (round2(totalRatio + ratio) > round2(config.maxTotalRatio)) break;
    const amount = round2((baseAmount * ratio) / 100);
    if (amount < 0.01) continue;

    totalRatio = round2(totalRatio + ratio);
    totalAmount = round2(totalAmount + amount);
    out.push({ userId: node.userId, level: node.depth, ratio, amount });
  }

  return out;
}

/**
 * 账户可结算金额：只把 `SETTLED` 计入余额，`PENDING` 单独展示为「在途」。
 * 冲正（REVERSED）金额为 0，不参与任何口径。
 */
export function summariseCommission(rows: { status: string; amountCny: number | string }[]): {
  pending: number;
  settled: number;
  reversed: number;
} {
  let pending = 0;
  let settled = 0;
  let reversed = 0;
  for (const r of rows) {
    const v = Number(r.amountCny) || 0;
    if (r.status === "PENDING") pending += v;
    else if (r.status === "SETTLED") settled += v;
    else if (r.status === "REVERSED") reversed += v;
  }
  return { pending: round2(pending), settled: round2(settled), reversed: round2(reversed) };
}

/**
 * 计算闭包表要写入的行（自动升级/建立上下级关系时调用）。
 *
 * 规则：新分销商 D 的直接上级是 U 时，需要插入
 *   (D,D,0)、(U,D,1)、以及 U 的所有祖先 (A,D,depth+1)。
 *
 * ⚠️ 必须**按祖先去重并保留最短路径**：
 *   `inviterId` 本人通常也出现在 `inviterAncestors`（即 U 自己的 (U,U,0) 行），
 *   若直接拼接就会产生两条 (U,D,1) —— 闭包表主键是 (ancestorId,descendantId)，
 *   重复行会让 createMany 直接抛唯一冲突（单测里已复现，故此处收敛）。
 */
export function planClosureRows(
  descendantId: string,
  inviterId: string | null,
  inviterAncestors: AncestorNode[],
): { ancestorId: string; descendantId: string; depth: number }[] {
  const depthByAncestor = new Map<string, number>();
  depthByAncestor.set(descendantId, 0);

  if (inviterId && inviterId !== descendantId) {
    depthByAncestor.set(inviterId, 1);
    for (const a of inviterAncestors) {
      if (a.userId === descendantId) continue;
      const depth = a.depth + 1;
      const existing = depthByAncestor.get(a.userId);
      if (existing === undefined || depth < existing) depthByAncestor.set(a.userId, depth);
    }
  }

  return [...depthByAncestor.entries()]
    .map(([ancestorId, depth]) => ({ ancestorId, descendantId, depth }))
    .sort((a, b) => a.depth - b.depth || a.ancestorId.localeCompare(b.ancestorId));
}

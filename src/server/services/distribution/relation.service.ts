import "server-only";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { badRequest, notFound } from "@/lib/errors";
import { generateReferralCode } from "@/lib/distribution/referral";
import { planClosureRows } from "@/lib/distribution/rules";
import {
  DISTRIBUTION_CONSOLE_PATH,
  DISTRIBUTION_INVITE_PATH,
  type DistributionIdentity,
} from "@/lib/distribution/contract";
import { maskEmail } from "@/lib/distribution/mask";
import { notifyPromoted } from "./notify.service";
import { audit } from "@/lib/audit";

/**
 * 分销**关系闭包**读写。
 *
 * 本文件只做一件核心的事：维护 `distribution_relations` 闭包表，
 * 使「取某人的全部上级」成为一次带索引的查询，而不是递归 CTE 或 path LIKE。
 *
 * 关键不变量：
 *   - 每个成为分销体系一员的用户都有 (自己,自己,0) 这一行；
 *   - 有上级 U 时，U 的全部祖先都要按 depth+1 继承下来（否则跨级佣金会断链）。
 */

/** 相对某人的祖先节点（depth=0 是自己，1=直接上级…） */
export interface Ancestor {
  userId: string;
  depth: number;
}

/** 闭包查询：以 userId 为子孙的全部祖先（含自己 depth=0） */
export async function getClosure(userId: string): Promise<Ancestor[]> {
  const rows = await prisma.distributionRelation.findMany({
    where: { descendantId: userId },
    select: { ancestorId: true, depth: true },
    orderBy: [{ depth: "asc" }, { ancestorId: "asc" }],
  });
  return rows.map((r) => ({ userId: r.ancestorId, depth: r.depth }));
}

/**
 * 分佣用的受益链：从**归属分销商**向上，depth=1 即归属分销商本人。
 * （闭包里的 depth 是「相对该分销商」，平移到「相对受益人」要 +1。）
 */
/**
 * 归属分销商向上的分佣链（depth=1 是归属人本人）。
 *
 * `tier` 一并带出（P2-15）：**每一环的分销商等级可能不同**，
 * 等级差异化的佣金规则必须在"逐级"解析时用该级本人的等级，而不是归属人的等级。
 */
export async function getCommissionChain(distributorId: string): Promise<Ancestor[]> {
  const closure = await getClosure(distributorId);
  if (closure.length === 0) return [];
  const tiers = await prisma.distributorAccount.findMany({
    where: { userId: { in: closure.map((a) => a.userId) } },
    select: { userId: true, tier: true },
  });
  const tierMap = new Map(tiers.map((t) => [t.userId, t.tier]));
  return closure.map((a) => ({
    userId: a.userId,
    depth: a.depth + 1,
    tier: tierMap.get(a.userId) ?? 0,
  }));
}

/** 我的全部下级 id（depth>=1）；maxDepth 用于只取直接下级 */
export async function getDescendantIds(userId: string, maxDepth?: number): Promise<string[]> {
  const rows = await prisma.distributionRelation.findMany({
    where: {
      ancestorId: userId,
      depth: { gte: 1, ...(maxDepth ? { lte: maxDepth } : {}) },
    },
    select: { descendantId: true, depth: true },
  });
  return rows.map((r) => r.descendantId);
}

/** 直接下级 id（depth=1） */
export async function getDirectSubordinateIds(userId: string): Promise<string[]> {
  return getDescendantIds(userId, 1);
}

/**
 * 生成/补齐专属推广码（惰性，注册时生成；老用户第一次打开推广页时补）。
 * 并发安全依赖 `users.referralCode` 唯一约束：冲突就换一个码重试。
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) throw notFound("用户不存在");
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch {
      // 唯一约束冲突（极低概率）→ 换码重试
    }
  }
  throw badRequest("推广码生成失败，请稍后重试");
}

/** 按推广码找人（大小写已在入口规范化） */
export async function findUserByReferralCode(code: string) {
  return prisma.user.findUnique({
    where: { referralCode: code },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isDistributor: true,
      distLevel: true,
    },
  });
}

/**
 * 以「**他作为客户绑定的上级**」为准，重建该用户的分销树闭包与展示字段。
 *
 * 为什么归属来源是客户绑定表而不是注册链接：
 *   佣金链是「订单归属的分销商 → 他的上级 → 再上级」。而「谁是某人的上级」这件事，
 *   唯一权威记录就是 `distributor_customer_binds`（首次绑定定终身、复购自动归属、
 *   不可抢绑都由它保证）。注册时的推广 cookie 只是**建立绑定的入口**，
 *   一旦绑定成立，后续一切以其为准（换设备/换链接都不影响）。
 *
 * 调用时机：用户**成为分销商时**（首次成功推广）——此时他的上级关系已经确定。
 * 不做「每个客户都建闭包」的原因：闭包表表达的是**分销商之间**的关系，
 * 把纯客户也塞进去会让「团队人数」这类统计口径失真。
 *
 * 幂等且可重建：先删掉该用户作为 descendant 的全部行，再按当前绑定重写
 * （换绑后旧链路不会残留成幽灵上级）。
 */
export async function syncClosureFromBind(userId: string): Promise<{ inviterId: string | null }> {
  const bind = await prisma.distributorCustomerBind.findUnique({
    where: { customerId: userId },
    select: { distributorId: true, status: true },
  });
  const inviterId =
    bind && bind.status === "ACTIVE" && bind.distributorId !== userId ? bind.distributorId : null;

  const [inviter, inviterClosure] = await Promise.all([
    inviterId
      ? prisma.user.findUnique({
          where: { id: inviterId },
          select: { id: true, distLevel: true, distPath: true, status: true },
        })
      : Promise.resolve(null),
    inviterId ? getClosure(inviterId) : Promise.resolve([]),
  ]);

  const effectiveInviter = inviter && inviter.status === "ACTIVE" ? inviter.id : null;
  const rows = planClosureRows(userId, effectiveInviter, effectiveInviter ? inviterClosure : []);

  await prisma.$transaction([
    prisma.distributionRelation.deleteMany({ where: { descendantId: userId } }),
    prisma.distributionRelation.createMany({ data: rows, skipDuplicates: true }),
    prisma.user.update({
      where: { id: userId },
      data: {
        invitedById: effectiveInviter,
        distLevel: effectiveInviter ? (inviter?.distLevel ?? 0) + 1 : 0,
        distPath: effectiveInviter ? `${inviter?.distPath ?? "/"}${effectiveInviter}/` : null,
      },
    }),
  ]);

  return { inviterId: effectiveInviter };
}

/**
 * 换绑后重建「该用户 + 其整棵子树」的闭包（P0-3）。
 *
 * 为什么必须有：闭包表存的是**整条祖先链**。换绑只重建被换绑者本人时，
 * 他的所有下级仍然指向旧上级链 —— 之后下级产生的订单会继续按旧链分佣（系统性错账）。
 * 因此换绑后沿着「直接下级」广度优先，把每个节点的祖先链整体重算一遍。
 *
 * 幂等：每个节点的行都是「先删后按当前父链重建」，重复执行结果一致。
 */
export async function rebuildSubtreeClosure(rootUserId: string): Promise<number> {
  await syncClosureFromBind(rootUserId);

  const visited = new Set<string>([rootUserId]);
  const queue: string[] = [rootUserId];
  let touched = 0;

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parentChain = await getClosure(parentId);
    const children = await prisma.distributionRelation.findMany({
      where: { ancestorId: parentId, depth: 1 },
      select: { descendantId: true },
    });
    for (const { descendantId } of children) {
      if (visited.has(descendantId)) continue;
      visited.add(descendantId);
      const rows = planClosureRows(descendantId, parentId, parentChain);
      await prisma.$transaction([
        prisma.distributionRelation.deleteMany({ where: { descendantId } }),
        prisma.distributionRelation.createMany({ data: rows, skipDuplicates: true }),
      ]);
      touched += 1;
      queue.push(descendantId);
    }
  }

  if (touched > 0) {
    logger.info({ rootUserId, touched }, "分销：换绑后已重建子树闭包");
  }
  return touched;
}

/**
 * 自动升级为分销商（首次成功推广即生效，无需申请审核）。
 * 返回 true 表示「本次刚刚升级」（用于审计/通知）。
 *
 * ⚠️ 必须同时建立他的分销树闭包：他作为客户绑定的上级，自动成为他作为分销商的上级
 * （产品文档 §6.2）。漏掉这一步的后果不是"少算一级"，而是**整条佣金链为空**——
 * 闭包表是 `getCommissionChain` 的唯一数据来源（集成测试已覆盖该回归）。
 */
export async function promoteToDistributor(userId: string): Promise<boolean> {
  const claimed = await prisma.user.updateMany({
    where: { id: userId, isDistributor: false },
    data: { isDistributor: true, firstPromoteAt: new Date() },
  });
  const justPromoted = claimed.count > 0;

  // 账户行按需创建（列表页展示余额；没有它不影响计佣，明细才是事实来源）
  await prisma.distributorAccount.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  // 闭包按当前绑定重建（幂等；刚升级与已升级都要保证链路最新）
  await syncClosureFromBind(userId);

  if (justPromoted) {
    logger.info({ userId }, "分销：用户首次成功推广，已自动成为分销商");
    // 旁路通知（不 await）；首次晋升只发一次
    void notifyPromoted({ userId }).catch(() => undefined);
  }
  return justPromoted;
}

/** 确保闭包里有「自己」那一行（老用户/自然流量用户首次参与时补齐） */
export async function ensureSelfClosure(userId: string): Promise<void> {
  await prisma.distributionRelation.upsert({
    where: { ancestorId_descendantId: { ancestorId: userId, descendantId: userId } },
    create: { ancestorId: userId, descendantId: userId, depth: 0 },
    update: {},
  });
}

/** 个人分销身份摘要（推广页/个人中心用） */
export async function getIdentity(userId: string, baseUrl: string): Promise<DistributionIdentity> {
  const code = await ensureReferralCode(userId);
  await ensureSelfClosure(userId);

  const [user, directCount, teamCount, bind] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        isDistributor: true,
        firstPromoteAt: true,
        invitedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.distributionRelation.count({
      where: { ancestorId: userId, depth: 1 },
    }),
    prisma.distributionRelation.count({
      where: { ancestorId: userId, depth: { gte: 1 } },
    }),
    prisma.distributorCustomerBind.findUnique({
      where: { customerId: userId },
      select: { status: true, distributor: { select: { name: true, email: true } } },
    }),
  ]);

  const boundTo = bind && bind.status === "ACTIVE" && bind.distributor ? bind.distributor : null;
  const inviteBase = baseUrl.replace(/\/$/, "");
  return {
    referralCode: code,
    // 分享出去的是**商城首页**（客户点开就是正常购物页），归属由代理层的签名 cookie 完成
    inviteUrl: `${inviteBase}${DISTRIBUTION_INVITE_PATH}?ref=${code}`,
    consolePath: DISTRIBUTION_CONSOLE_PATH,
    inviteCode: code,
    isDistributor: user?.isDistributor ?? false,
    inviterName: user?.invitedBy ? maskEmail(user.invitedBy.email) : null,
    boundToName: boundTo ? maskEmail(boundTo.email) : null,
    directCount,
    teamCount,
    firstPromoteAt: user?.firstPromoteAt?.toISOString() ?? null,
  };
}

/* ─────────────────────────── 分销商等级（P2-15） ─────────────────────────── */

/** 读取某分销商的等级（0=普通） */
export async function getDistributorTier(userId: string): Promise<number> {
  const row = await prisma.distributorAccount.findUnique({
    where: { userId },
    select: { tier: true },
  });
  return row?.tier ?? 0;
}

/**
 * 设置分销商等级（管理端）。
 *
 * 为什么等级要放在 `distributor_accounts` 而不是 `users`：
 * 它只对"已经成为分销商"的账号有意义，且与账户余额/冻结同属经营属性；
 * 放在账户行上也天然满足"删除用户→账户行随之消失"的语义。
 *
 * 等级影响**佣金比例**（`commission_rules.tierLevel`），因此改等级后不需要重算历史佣金 ——
 * 历史流水已经按当时的规则落库，这正是"快照式账本"的意义。
 */
export async function setDistributorTier(input: {
  userId: string;
  tier: number;
  actorId: string;
  note?: string;
  req?: NextRequest;
}): Promise<{ userId: string; tier: number }> {
  const tier = Math.trunc(input.tier);
  if (!Number.isInteger(tier) || tier < 0 || tier > 10) {
    throw badRequest("分销商等级需为 0 ~ 10 的整数（0=普通）");
  }
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { isDistributor: true, name: true, email: true },
  });
  if (!user) throw notFound("用户不存在");
  if (!user.isDistributor) throw badRequest("该用户还不是分销商（首次成功推广后自动成为分销商）");

  const before = await getDistributorTier(input.userId);
  await prisma.distributorAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, tier },
    update: { tier },
  });
  await audit({
    userId: input.actorId,
    action: "DISTRIBUTION_TIER_SET",
    entity: "DistributorAccount",
    entityId: input.userId,
    meta: { from: before, to: tier, note: input.note ?? "" },
    ...(input.req ? { req: input.req } : {}),
  });
  logger.info({ userId: input.userId, from: before, to: tier }, "分销：已调整分销商等级");
  return { userId: input.userId, tier };
}

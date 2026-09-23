import "server-only";
import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { BindType } from "@/lib/distribution/contract";
import { getDistributionConfig } from "./config.service";
import {
  findUserByReferralCode,
  getCommissionChain,
  promoteToDistributor,
  rebuildSubtreeClosure,
} from "./relation.service";

/**
 * 客户归属绑定 与 订单归属快照。
 *
 * 三条产品规则在这里落成代码（文档只是承诺，代码才是保证）：
 *   ① 首次绑定定终身：已绑定客户再点别人链接 → 不覆盖（默认），订单仍归原分销商；
 *   ② 复购自动归属：下单时只看 `distributor_customer_binds`，与本次链接无关；
 *   ③ 自然流量不归属：没有绑定、也没有可用推广码 → 落 `natural=true`，不产生任何佣金。
 *
 * 并发安全：`customerId` 上的唯一约束是「不可抢绑」的最终保证 —— 应用层判重会被
 * 并发穿透（两个请求同时判「还没绑定」），数据库不会。
 */

export type BindOutcome =
  | "BOUND"
  | "REBOUND"
  | "ALREADY_BOUND_SAME"
  | "ALREADY_BOUND_OTHER"
  | "INVALID_CODE"
  | "SELF_BIND"
  /** 会形成循环归属（目标分销商已是该客户的下级）—— 拒绝，防 A↔B 互绑互刷返佣 */
  | "CYCLE"
  | "REBIND_DISABLED"
  /** 换绑已受理，等待平台审核（allowRebind=true 时的默认路径） */
  | "REBIND_PENDING";

export interface BindResult {
  outcome: BindOutcome;
  distributorId: string | null;
  bindId?: string;
  /** 本次绑定是否让推广人「首次成功推广」而自动升级为分销商 */
  justPromoted?: boolean;
}

/** 当前有效绑定（唯一约束保证最多一条） */
export async function getActiveBind(customerId: string) {
  const row = await prisma.distributorCustomerBind.findUnique({
    where: { customerId },
    include: {
      distributor: { select: { id: true, name: true, email: true, status: true } },
    },
  });
  // 任一方已注销（SetNull 后 distributor 为 null）→ 视为无有效绑定
  if (!row || row.status !== "ACTIVE" || !row.distributor) return null;
  if (row.expireAt && row.expireAt.getTime() < Date.now()) return null;
  if (row.distributor.status !== "ACTIVE") return null;
  return row;
}

/**
 * 绑定客户到分销商（幂等）。
 *
 * 注意 rebind 的实现方式：`customerId` 是唯一键，解绑后**行仍在**，
 * 因此换绑只能 UPDATE 原行（而不是 insert 新行，否则唯一冲突）。
 * 绑定历史由审计日志（DISTRIBUTION_BIND / DISTRIBUTION_REBIND）保留。
 */
export async function bindCustomer(input: {
  customerId: string;
  code: string;
  bindType?: BindType;
  source?: string;
  /**
   * 跳过换绑审核（平台审核通过后落库时使用）。
   * 默认 false —— 商业系统里换绑是**资金关系变更**，必须留人工审核痕迹。
   */
  skipApproval?: boolean;
  req?: NextRequest;
}): Promise<BindResult> {
  const config = await getDistributionConfig();
  const distributor = await findUserByReferralCode(input.code);
  if (!distributor || distributor.status !== "ACTIVE") {
    return { outcome: "INVALID_CODE", distributorId: null };
  }
  if (distributor.id === input.customerId) {
    return { outcome: "SELF_BIND", distributorId: null };
  }

  /* 循环绑定防护（P2 修复）：只挡「直连自绑」不够 ——
     B 先成为 A 的下级后，A 再作为**客户**绑定到 B（或绑定 B 的任一上级），
     闭包表会形成环，此后 A 的订单给 B 返佣、B 的订单给 A 返佣（互刷）。
     买家本人的自购佣金由 buyerId 规则挡住，所以现有风控的
     `fromUserId === toUserId` 信号查不出这种链路。
     判定：目标分销商不得已在该客户的后代集合中（闭包表一次命中查询）。 */
  const wouldCycle = await prisma.distributionRelation.findFirst({
    where: {
      ancestorId: input.customerId,
      descendantId: distributor.id,
      depth: { gte: 1 },
    },
    select: { ancestorId: true },
  });
  if (wouldCycle) {
    return { outcome: "CYCLE", distributorId: null };
  }

  const existingRow = await prisma.distributorCustomerBind.findUnique({
    where: { customerId: input.customerId },
    include: { distributor: { select: { status: true } } },
  });

  /* 只有**仍然有效**的旧绑定才受保护（P1-4）：
     绑定过期、或上级被停用/注销时，`getActiveBind` 已判定该客户无有效绑定
     （订单走 natural、不产生任何佣金），但这里原先只看 `status === "ACTIVE"`
     → 客户既拿不到佣金，又**永远无法再绑任何分销商**（两处口径分叉，商业交付不可接受）。
     失效的旧绑定一律按「可重新绑定」处理：落到下面的建绑分支直接 UPDATE 覆盖，
     且不需要走换绑审核（没有有效的旧归属需要保护）。 */
  const existing =
    existingRow &&
    existingRow.status === "ACTIVE" &&
    (!existingRow.expireAt || existingRow.expireAt.getTime() >= Date.now()) &&
    existingRow.distributor?.status === "ACTIVE"
      ? existingRow
      : null;

  const expireAt =
    config.bindExpireDays > 0 ? new Date(Date.now() + config.bindExpireDays * 86_400_000) : null;
  const bindType: BindType = input.bindType ?? "link";

  if (existing) {
    if (existing.distributorId === distributor.id) {
      return { outcome: "ALREADY_BOUND_SAME", distributorId: distributor.id, bindId: existing.id };
    }
    if (!config.allowRebind) {
      return {
        outcome: "ALREADY_BOUND_OTHER",
        distributorId: existing.distributorId,
        bindId: existing.id,
      };
    }

    /* 换绑**先受理、后审核**：客户随时可能被另一条链接"抢走"归因（= 抢走别人的佣金），
       因此即使开启 allowRebind，也默认走人工审核（skipApproval 仅用于审核通过后落库）。 */
    if (!input.skipApproval) {
      const pending = await prisma.rebindRequest.findFirst({
        where: { customerId: input.customerId, status: "PENDING" },
      });
      if (pending) {
        return {
          outcome: "REBIND_PENDING",
          distributorId: existing.distributorId,
          bindId: existing.id,
        };
      }
      const request = await prisma.rebindRequest.create({
        data: {
          customerId: input.customerId,
          fromDistributorId: existing.distributorId,
          toDistributorId: distributor.id,
          requestedNote: input.source ?? null,
        },
      });
      await audit({
        action: "DISTRIBUTION_REBIND_REQUEST",
        entity: "RebindRequest",
        entityId: request.id,
        meta: {
          customerId: input.customerId,
          from: existing.distributorId ?? "",
          to: distributor.id,
        },
        req: input.req,
      });
      logger.info(
        { requestId: request.id, customerId: input.customerId, to: distributor.id },
        "分销：换绑申请已受理，等待审核",
      );
      return {
        outcome: "REBIND_PENDING",
        distributorId: existing.distributorId,
        bindId: existing.id,
      };
    }

    const updated = await prisma.distributorCustomerBind.update({
      where: { id: existing.id },
      data: {
        distributorId: distributor.id,
        bindType,
        source: input.source ?? null,
        bindTime: new Date(),
        expireAt,
        status: "ACTIVE",
        releasedAt: null,
      },
    });
    const justPromoted = await promoteToDistributor(distributor.id);

    /* 换绑必须重建**客户本人 + 其整棵子树**的祖先链（P0-3）。
       这里曾经漏掉：换绑分支提前 return，只有「首次绑定」分支重建闭包 ——
       结果是客户的新上级生效了，但他下级的分销链仍指向旧上级，之后下级产生的订单
       会继续按旧链分佣（系统性错账）。纯客户不进分销树，只更新展示字段。 */
    const reboundCustomer = await prisma.user.findUnique({
      where: { id: input.customerId },
      select: { isDistributor: true },
    });
    if (reboundCustomer?.isDistributor) {
      await rebuildSubtreeClosure(input.customerId);
    } else {
      await prisma.user.update({
        where: { id: input.customerId },
        data: { invitedById: distributor.id, distLevel: 0 },
      });
    }

    await audit({
      userId: input.customerId,
      action: "DISTRIBUTION_REBIND",
      entity: "User",
      entityId: input.customerId,
      meta: { from: existing.distributorId, to: distributor.id, source: input.source ?? "" },
      req: input.req,
    });
    return { outcome: "REBOUND", distributorId: distributor.id, bindId: updated.id, justPromoted };
  }

  // 从未绑定（或旧绑定已失效）：建立/覆盖绑定。
  // ⚠️ 用 existingRow（原始行）而不是 existing：existing 语义是「仍然有效的绑定」，
  //    走到这里必然为 null，但 customerId 是**唯一键** —— 失效的旧行必须 UPDATE 覆盖，
  //    直接 INSERT 会撞唯一约束（这也是「解绑后无法重绑」的另一个坑）。
  const created = existingRow
    ? await prisma.distributorCustomerBind.update({
        where: { id: existingRow.id },
        data: {
          distributorId: distributor.id,
          bindType,
          source: input.source ?? null,
          bindTime: new Date(),
          expireAt,
          status: "ACTIVE",
          releasedAt: null,
        },
      })
    : await prisma.distributorCustomerBind.create({
        data: {
          distributorId: distributor.id,
          customerId: input.customerId,
          bindType,
          source: input.source ?? null,
          expireAt,
        },
      });

  // 「推广成功了自然就是分销商」——无需申请、无需审核
  const justPromoted = await promoteToDistributor(distributor.id);

  // 客户侧：展示字段（"我的上级"）以当前绑定为准。
  // 闭包表只在**他本人也是分销商**时才重建 —— 纯客户不该出现在分销树里，
  // 否则「团队人数」会把普通客户也算进去，统计口径就废了。
  const customer = await prisma.user.findUnique({
    where: { id: input.customerId },
    select: { isDistributor: true },
  });
  if (customer?.isDistributor) {
    // 换绑会改变他的上级 → 必须连整棵子树的祖先链一起重建（否则下级继续按旧链分佣）
    await rebuildSubtreeClosure(input.customerId);
  } else {
    await prisma.user.update({
      where: { id: input.customerId },
      data: { invitedById: distributor.id, distLevel: 0 },
    });
  }

  await audit({
    userId: input.customerId,
    action: "DISTRIBUTION_BIND",
    entity: "User",
    entityId: input.customerId,
    meta: {
      distributorId: distributor.id,
      bindType,
      source: input.source ?? "",
      justPromoted,
    },
    req: input.req,
  });
  logger.info(
    { customerId: input.customerId, distributorId: distributor.id, justPromoted },
    "分销：客户绑定成功",
  );

  return { outcome: "BOUND", distributorId: distributor.id, bindId: created.id, justPromoted };
}

/** 客户是否已经下过单（用于「已下过单默认不可补绑」） */
export async function hasPaidOrders(customerId: string): Promise<boolean> {
  const count = await prisma.order.count({
    where: { userId: customerId, paidAt: { not: null } },
  });
  return count > 0;
}

/**
 * 注册后的绑定尝试（`bindTrigger=register` 时的主路径）。
 * 已下单过的老用户不会被注册流程影响（本函数只在新注册时调用）。
 */
export async function bindOnRegister(input: {
  userId: string;
  code: string | null;
  req?: NextRequest;
}): Promise<BindResult | null> {
  if (!input.code) return null;
  const config = await getDistributionConfig();
  if (config.bindTrigger !== "register") return null;
  return bindCustomer({
    customerId: input.userId,
    code: input.code,
    bindType: "link",
    source: "register",
    ...(input.req ? { req: input.req } : {}),
  });
}

/**
 * 下单时的归属解析 + 快照写入。
 *
 * 判定顺序（与产品文档 §5.6 完全一致）：
 *   ① 已有有效绑定 → 归该分销商，**忽略本次链接**；
 *   ② 无绑定且本次带可用推广码、且客户从未下过单 → 先补绑，再归该分销商；
 *   ③ 都不满足 → 自然订单（`natural=true`），不产生佣金。
 *
 * 快照不可变：已有 `order_attributions` 行时不做任何覆盖
 * （事后解绑/换绑不能改写历史订单的佣金归属）。
 */
export async function attributeOrder(input: {
  orderId: string;
  userId: string | null;
  code?: string | null;
  req?: NextRequest;
}): Promise<{ distributorId: string | null; natural: boolean }> {
  const existing = await prisma.orderAttribution.findUnique({
    where: { orderId: input.orderId },
    select: { distributorId: true, natural: true },
  });
  if (existing) {
    return { distributorId: existing.distributorId, natural: existing.natural };
  }

  // 游客单（userId=null）：没有账号就没有归属主体，直接记自然单
  if (!input.userId) {
    await prisma.orderAttribution.upsert({
      where: { orderId: input.orderId },
      create: { orderId: input.orderId, distributorId: null, natural: true },
      update: {},
    });
    return { distributorId: null, natural: true };
  }

  let bind = await getActiveBind(input.userId);
  if (!bind && input.code && !(await hasPaidOrders(input.userId))) {
    const result = await bindCustomer({
      customerId: input.userId,
      code: input.code,
      bindType: "link",
      source: "first_order",
      ...(input.req ? { req: input.req } : {}),
    });
    if (
      result.outcome === "BOUND" ||
      result.outcome === "REBOUND" ||
      result.outcome === "ALREADY_BOUND_SAME"
    ) {
      bind = await getActiveBind(input.userId);
    }
  }

  if (!bind) {
    await prisma.orderAttribution.upsert({
      where: { orderId: input.orderId },
      create: { orderId: input.orderId, distributorId: null, natural: true },
      update: {},
    });
    return { distributorId: null, natural: true };
  }

  // 绑定存在但分销商已注销（SetNull）→ 按自然单处理，归谁都不成立
  const distributorId = bind.distributorId;
  if (!distributorId) {
    await prisma.orderAttribution.upsert({
      where: { orderId: input.orderId },
      create: { orderId: input.orderId, distributorId: null, natural: true },
      update: {},
    });
    return { distributorId: null, natural: true };
  }

  const chain = await getCommissionChain(distributorId);
  /* ⚠️ 口径说明（2026-09-23 深度审查确认，勿误读）：
     `relationPathSnapshot` 是**归属时刻的佣金链快照**，目前只用于审计与回溯，
     **计佣并不读它** —— `commission.service` 计提时重新调 `getCommissionChain()`
     取当时的活链，等级也取当时的 `distributorAccount.tier`。

     因此存在两种口径差异（属产品决策，本轮未改资金口径）：
       · 订单支付与计提之间若发生换绑/闭包重建（对账补算可延迟数天），该订单按**新链**分佣；
       · 支付后调整等级，尚未计提的订单按**新等级**算。
     若要切到「快照口径」（首次绑定定终身 + 支付时等级），需为等级**新增快照字段**
     （当前只有链快照）、回填历史数据、并重新校准受影响的分销集成测试 —— 独立批次，勿顺手改。 */
  await prisma.orderAttribution.upsert({
    where: { orderId: input.orderId },
    create: {
      orderId: input.orderId,
      distributorId,
      bindId: bind.id,
      relationPathSnapshot: chain as unknown as Prisma.InputJsonValue,
      natural: false,
    },
    update: {},
  });

  return { distributorId, natural: false };
}

/** 管理员解绑（换绑审核/风控处置用）；历史订单归属不受影响 */
export async function releaseBind(input: {
  bindId: string;
  actorId: string;
  note?: string;
  req?: NextRequest;
}): Promise<{ released: boolean; customerId: string }> {
  const bind = await prisma.distributorCustomerBind.findUnique({
    where: { id: input.bindId },
  });
  if (!bind) throw notFound("绑定关系不存在");
  if (bind.status !== "ACTIVE") throw badRequest("该绑定已失效");

  await prisma.distributorCustomerBind.update({
    where: { id: bind.id },
    data: { status: "RELEASED", releasedAt: new Date() },
  });

  /* P1-5 修复：解绑必须**重建闭包**。
     闭包表（distribution_relations）是佣金分组团的唯一依据，而 releaseBind 原先只改
     绑定状态 —— 结果：管理员解绑后，旧上级仍留在该客户及其整棵子树的祖先链里，
     下级订单会继续按旧链分佣，风控解绑动作形同虚设。
     `rebuildSubtreeClosure` 会先按「当前有效绑定」重算根节点（此时绑定已 RELEASED
     → 上级为 null，闭包行被清空、invitedById 归零），再把变更传导到整棵子树。 */
  if (bind.customerId) {
    await rebuildSubtreeClosure(bind.customerId);
  }

  await audit({
    userId: input.actorId,
    action: "DISTRIBUTION_UNBIND",
    entity: "User",
    entityId: bind.customerId ?? undefined,
    meta: { distributorId: bind.distributorId ?? "", note: input.note ?? "" },
    req: input.req,
  });
  return { released: true, customerId: bind.customerId ?? "" };
}

/* ─────────────────────────── 换绑审核（P1-8） ─────────────────────────── */

export interface RebindRequestRow {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  fromDistributorId: string | null;
  fromDistributorName: string | null;
  toDistributorId: string;
  toDistributorName: string;
  status: string;
  requestedNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** 待审核换绑申请列表（后台） */
export async function listRebindRequests(opts: {
  status?: string;
  skip: number;
  take: number;
}): Promise<{ rows: RebindRequestRow[]; total: number; pending: number }> {
  const where = opts.status ? { status: opts.status } : {};
  const [rows, total, pending] = await Promise.all([
    prisma.rebindRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: opts.skip,
      take: opts.take,
      include: {
        customer: { select: { name: true, email: true } },
        fromDistributor: { select: { name: true } },
        toDistributor: { select: { name: true } },
      },
    }),
    prisma.rebindRequest.count({ where }),
    prisma.rebindRequest.count({ where: { status: "PENDING" } }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customer.name,
      customerEmail: r.customer.email,
      fromDistributorId: r.fromDistributorId,
      fromDistributorName: r.fromDistributor?.name ?? null,
      toDistributorId: r.toDistributorId,
      toDistributorName: r.toDistributor.name,
      status: r.status,
      requestedNote: r.requestedNote,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
    total,
    pending,
  };
}

/**
 * 审核换绑申请。
 *
 * 通过时**必须**走 `bindCustomer({ skipApproval: true })`，这样才会连带
 * `rebuildSubtreeClosure()` 重建该客户整棵子树的祖先链（P0-3 的错账防线）。
 */
export async function reviewRebindRequest(input: {
  requestId: string;
  action: "approve" | "reject";
  actorId: string;
  note?: string;
  req?: NextRequest;
}): Promise<{ status: "APPROVED" | "REJECTED"; customerId: string }> {
  const request = await prisma.rebindRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw notFound("换绑申请不存在");
  if (request.status !== "PENDING") throw badRequest("该申请已处理，请勿重复操作");

  if (input.action === "reject") {
    await prisma.rebindRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        reviewedById: input.actorId,
        reviewNote: input.note?.trim() || null,
        reviewedAt: new Date(),
      },
    });
    await audit({
      userId: input.actorId,
      action: "DISTRIBUTION_REBIND_REJECT",
      entity: "RebindRequest",
      entityId: request.id,
      meta: { customerId: request.customerId, note: input.note ?? "" },
      req: input.req,
    });
    return { status: "REJECTED", customerId: request.customerId };
  }

  // 通过：取目标上级的推荐码，按「跳过审核」路径真正落库（含子树闭包重建）
  const target = await prisma.user.findUnique({
    where: { id: request.toDistributorId },
    select: { referralCode: true, status: true },
  });
  if (!target || target.status !== "ACTIVE" || !target.referralCode) {
    throw badRequest("目标上级账号不可用（已禁用或缺少推广码），无法完成换绑");
  }

  const result = await bindCustomer({
    customerId: request.customerId,
    code: target.referralCode,
    bindType: "manual",
    source: `换绑审核通过（申请 ${request.id}）`,
    skipApproval: true,
    ...(input.req ? { req: input.req } : {}),
  });
  if (result.outcome !== "REBOUND" && result.outcome !== "BOUND") {
    throw conflict(`换绑落库失败（${result.outcome}），请检查客户当前绑定状态`);
  }

  await prisma.rebindRequest.update({
    where: { id: request.id },
    data: {
      status: "APPROVED",
      reviewedById: input.actorId,
      reviewNote: input.note?.trim() || null,
      reviewedAt: new Date(),
    },
  });
  await audit({
    userId: input.actorId,
    action: "DISTRIBUTION_REBIND_APPROVE",
    entity: "RebindRequest",
    entityId: request.id,
    meta: {
      customerId: request.customerId,
      from: request.fromDistributorId ?? "",
      to: request.toDistributorId,
      outcome: result.outcome,
    },
    req: input.req,
  });
  return { status: "APPROVED", customerId: request.customerId };
}

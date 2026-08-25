import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin } from "@/lib/auth/session";
import { serializeOrder } from "@/server/serializers";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { adminUserUpdateSchema } from "@/lib/validations/admin";
import { revokeAllUserTokens } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** GET /api/admin/users/[id] — 用户详情 + 最近订单 */
export const GET = apiHandler(async (req, ctx) => {
  await requireAdmin();
  const id = routeParam(ctx.params.id);

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { orders: true, reviews: true, addresses: true, refunds: true } },
    },
  });
  if (!user) throw notFound("用户不存在");

  const orders = await prisma.order.findMany({
    where: { userId: id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return json({ user, orders: orders.map(serializeOrder) });
});

/** PUT /api/admin/users/[id] — 编辑用户(昵称/邮箱/角色/状态) */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, adminUserUpdateSchema);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound("用户不存在");

  // 邮箱唯一性校验
  if (input.email && input.email !== target.email) {
    const dup = await prisma.user.findUnique({ where: { email: input.email } });
    if (dup) throw badRequest("该邮箱已被其他账号使用");
  }

  // 不能把自己的角色降级(避免失去管理权限)；也不能禁用自己
  if (id === actor.id) {
    if (input.role && input.role !== "ADMIN" && target.role === "ADMIN") {
      throw badRequest("不能取消自己的管理员角色");
    }
    if (input.status === "DISABLED") throw badRequest("不能禁用自己的账号");
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // 禁用用户时吊销其全部会话
  if (input.status === "DISABLED") await revokeAllUserTokens(id);

  await audit({
    userId: actor.id,
    action: "ADMIN_USER_UPDATE",
    entity: "User",
    entityId: id,
    meta: { changes: input },
    req,
  });

  return json({ user: updated });
});

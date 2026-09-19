import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { requireAdmin, revokeAllUserTokens } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { routeParam } from "@/app/api/_lib/params";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  /** 驳回原因（发给用户的说明，可选） */
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/admin/users/[id]/deletion — 处理客户注销申请（大爷指正：申请必须与后台衔接）
 *
 * approve = 确认注销（匿名化删除，GDPR/个保法口径）：
 *   保留订单等财务合规数据，个人信息匿名化（邮箱→deleted-{id}@invalid.local、
 *   姓名→已注销用户），账号停用、全部会话吊销；确认邮件在匿名化前发往原邮箱。
 * reject = 驳回申请：状态清空，用户可继续正常使用；驳回原因随邮件告知。
 */
export const POST = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, schema);

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, deletionRequestedAt: true, role: true },
  });
  if (!target) throw notFound("用户不存在");

  // 处理人不能注销自己（管理权限自我保护）
  if (id === actor.id) throw badRequest("不能处理自己的注销申请");

  if (!target.deletionRequestedAt) {
    throw badRequest("该用户当前没有在途的注销申请");
  }

  if (input.action === "approve") {
    // 匿名化前先给原邮箱发处理完成通知（邮箱一旦替换就无法送达）
    await sendMail({
      to: target.email,
      template: "account-deleted",
      data: { name: target.name },
    }).catch(() => undefined);

    await prisma.user.update({
      where: { id },
      data: {
        email: `deleted-${id}@invalid.local`,
        name: "已注销用户",
        status: "DISABLED",
        emailVerified: false,
        deletionRequestedAt: null,
      },
    });
    // 全端会话即时失效
    await revokeAllUserTokens(id);

    await audit({
      userId: actor.id,
      action: "ADMIN_USER_DELETION_APPROVE",
      entity: "User",
      entityId: id,
      meta: { originalEmail: target.email, originalName: target.name },
      req,
    });

    return json({ ok: true, action: "approve", anonymized: true });
  }

  // reject：驳回申请（原因可选，随邮件告知用户）
  await prisma.user.update({
    where: { id },
    data: { deletionRequestedAt: null },
  });

  await sendMail({
    to: target.email,
    template: "deletion-rejected",
    data: { name: target.name, ...(input.note ? { note: input.note } : {}) },
  }).catch(() => undefined);

  await audit({
    userId: actor.id,
    action: "ADMIN_USER_DELETION_REJECT",
    entity: "User",
    entityId: id,
    meta: { note: input.note ?? "" },
    req,
  });

  return json({ ok: true, action: "reject" });
});

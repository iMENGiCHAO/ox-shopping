import { apiHandler, json, readJson } from "@/lib/api";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z
  .object({
    /** 处理状态：new/read/replied/spam */
    status: z.enum(["new", "read", "replied", "spam"]).optional(),
    /** 客服处理备注（仅内部可见，不会发给顾客）；传空串=清空 */
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.note !== undefined, {
    message: "At least one of status/note is required",
  });

/**
 * PATCH /api/admin/contact-messages/[id] — 更新留言处理状态 / 内部备注
 *
 * 状态语义（见 schema）：
 * - new     新留言（默认，Tab 角标提醒）
 * - read    已读（客服看过但未回）
 * - replied 已回复（客服已通过邮件/电话回复顾客）
 * - spam    垃圾/无关留言（不计入待办）
 */
export const PATCH = apiHandler(async (req, ctx) => {
  const staff = await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, schema);

  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) throw notFound("Message not found");

  const updated = await prisma.contactMessage.update({
    where: { id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.note !== undefined ? { note: input.note.length > 0 ? input.note : null } : {}),
    },
  });

  await audit({
    userId: staff.id,
    action: "CONTACT_MESSAGE_UPDATE",
    entity: "ContactMessage",
    entityId: id,
    meta: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      noteChanged: input.note !== undefined,
    },
    req,
  });

  return json({ message: updated });
});

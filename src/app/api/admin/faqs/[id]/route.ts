import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { z } from "zod";

export const runtime = "nodejs";

const faqUpdateSchema = z.object({
  question: z.string().trim().min(2).max(200).optional(),
  answer: z.string().trim().min(2).optional(),
  questionEn: z.string().trim().max(200).optional().nullable(),
  answerEn: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  published: z.boolean().optional(),
});

/** PUT /api/admin/faqs/[id] */
export const PUT = apiHandler(async (req, ctx) => {
  await requireStaff();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, faqUpdateSchema);
  const row = await prisma.faq.update({ where: { id }, data: input });
  return json({ data: row });
});

/** DELETE /api/admin/faqs/[id] */
export const DELETE = apiHandler(async (req, ctx) => {
  await requireStaff();
  const id = routeParam(ctx.params.id);
  await prisma.faq.delete({ where: { id } });
  return json({ data: { ok: true } });
});

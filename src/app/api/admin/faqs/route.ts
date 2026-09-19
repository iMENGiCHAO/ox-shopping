import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { z } from "zod";

export const runtime = "nodejs";

const faqSchema = z.object({
  question: z.string().trim().min(2).max(200),
  answer: z.string().trim().min(2),
  /** 英文问答（可选；留空时英文站点回落到中文条目） */
  questionEn: z.string().trim().max(200).optional().nullable(),
  answerEn: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).default(0),
  published: z.boolean().default(true),
});

/** GET /api/admin/faqs */
export const GET = apiHandler(async () => {
  await requireStaff();
  const rows = await prisma.faq.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return json({ data: rows });
});

/** POST /api/admin/faqs */
export const POST = apiHandler(async (req) => {
  await requireStaff();
  const input = await readJson(req, faqSchema);
  const row = await prisma.faq.create({ data: input });
  return json({ data: row });
});

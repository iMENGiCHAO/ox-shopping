import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().max(254),
  productId: z.string().min(1).optional(),
  /** 客户选中的规格（变体级提醒） */
  attributes: z.record(z.string(), z.string()).optional(),
});

/** POST /api/notify-me — 售罄商品到货通知登记（公开，防灌水限流） */
export const POST = apiHandler(async (req) => {
  const input = await readJson(req, schema);
  const email = input.email.toLowerCase();

  const rl = await rateLimit({ key: `notifyme:${email}`, limit: 5, windowSeconds: 3600 });
  if (!rl.ok) throw rateLimited("登记太频繁，请稍后再试");

  // 同邮箱同商品去重：已登记则更新其关注的规格（官方逻辑：记住客户当前关注什么），
  // 并重置为待通知，便于新规格补货时再次提醒。
  const existing = await prisma.notifyMe.findFirst({
    where: { email, productId: input.productId ?? null },
  });
  if (existing) {
    const updated = await prisma.notifyMe.update({
      where: { id: existing.id },
      data: {
        ...(input.attributes ? { attributes: input.attributes } : {}),
        status: "draft",
        notifiedAt: null,
      },
    });
    return json({ data: { ok: true, already: true, id: updated.id } });
  }
  const row = await prisma.notifyMe.create({
    data: { email, productId: input.productId ?? null, attributes: input.attributes ?? undefined },
  });
  return json({ data: { ok: true, already: false, id: row.id } }, { status: 201 });
});

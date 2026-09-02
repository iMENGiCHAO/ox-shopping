import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { cookies } from "next/headers";
import { getLang } from "@/lib/shop-i18n-server";
import type { Lang } from "@/lib/shop-i18n";

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

  // 记录订阅时浏览器的语种（lang cookie > currency > en），用于按用户原语种发到货通知
  // 游客（未登录）也能订阅，所以用 cookie 而非 user.lang
  const lang: Lang = await getLang();

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
        lang, // 每次重新订阅都更新为当前语种
      },
    });
    return json({ data: { ok: true, already: true, id: updated.id } });
  }
  const row = await prisma.notifyMe.create({
    data: {
      email,
      productId: input.productId ?? null,
      attributes: input.attributes ?? undefined,
      lang,
    },
  });
  return json({ data: { ok: true, already: false, id: row.id } }, { status: 201 });
});

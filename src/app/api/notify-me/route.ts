import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { hasSoldOutSpecValue } from "@/server/services/spec-stock";
import { getClientIp } from "@/lib/server/utils-server";
import { z } from "zod";
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

  // 权限审计修复：单邮箱桶可被轮换邮箱绕过——叠加 IP 桶，挡「轮换邮箱无限
  // 灌 NotifyMe 行 → 补货时邮件轰炸 + DB 灌水」
  const ipRl = await rateLimit({
    key: `notifyme-ip:${getClientIp(req)}`,
    ...RATE_LIMITS.notifyMeIp,
  });
  if (!ipRl.ok) throw rateLimited("Too many requests, please try again later");

  const rl = await rateLimit({ key: `notifyme:${email}`, ...RATE_LIMITS.notifyMe });
  if (!rl.ok) throw rateLimited("Too many requests, please try again later");

  // 防御（大爷指正的 bug 兜底）：有货组合不允许登记到货通知——
  // 整件有货（ACTIVE 且 stock>0）时，登记规格里必须含至少一个「显式售罄」值
  // （与 PDP 售罄划线 / notifyRestock 触发口径一致：未追踪值视为可用）。
  // 否则下次该商品任意补货触发 notifyRestock 时，会立即给客户发出
  // 「从未售罄过」的错误到货邮件（allAvailable 恒真）。
  if (input.productId) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { stock: true, status: true, specStock: true },
    });
    if (!product) throw notFound("Product not found");
    if (product.status === "ACTIVE" && product.stock > 0) {
      if (!hasSoldOutSpecValue(product.specStock, input.attributes ?? {}))
        throw badRequest("This variant is in stock — you can add it to your bag now");
    }
  }

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
    return json({ ok: true, already: true, id: updated.id });
  }
  const row = await prisma.notifyMe.create({
    data: {
      email,
      productId: input.productId ?? null,
      attributes: input.attributes ?? undefined,
      lang,
    },
  });
  return json({ ok: true, already: false, id: row.id }, { status: 201 });
});

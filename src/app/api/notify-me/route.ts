import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { hasSoldOutSpecValue } from "@/server/services/spec-stock";
import {
  findVariant,
  normalizeSelection,
  parseVariantAttributes,
} from "@/server/services/variant-stock";
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

  // 防御（大爷指正的 bug 兜底 + 2026-09-29 扩展到组合粒度）：有货组合不允许
  // 登记到货通知——整件有货（ACTIVE 且 stock>0）时，登记的规格必须「确实买不了」：
  //   - 变体模式：所登记组合不存在或组合库存为 0（findVariant 与下单/购物车同
  //     口径；此前只看 specStock，变体商品的**所有**登记都被误拒——组合售罄
  //     也登记不上，顾客点「到货提醒」直接 400）
  //   - 存量维度池：登记规格里必须含至少一个「显式售罄」值（原口径）
  // 否则下次该商品任意补货触发 notifyRestock 时，会立即给客户发出
  // 「从未售罄过」的错误到货邮件（allAvailable 恒真）。
  if (input.productId) {
    const [product, variantRows] = await Promise.all([
      prisma.product.findUnique({
        where: { id: input.productId },
        select: { stock: true, status: true, specStock: true },
      }),
      prisma.productVariant.findMany({
        where: { productId: input.productId, isActive: true },
        select: { attributes: true, stock: true },
      }),
    ]);
    if (!product) throw notFound("Product not found");
    if (product.status === "ACTIVE" && product.stock > 0) {
      const IN_STOCK_MSG = "This variant is in stock — you can add it to your bag now";
      const registered = input.attributes ?? {};
      const hasSelection = Object.values(registered).some(
        (v) => typeof v === "string" && v.length > 0,
      );
      if (variantRows.length > 0) {
        // 变体模式：未选规格 = 无可购对象（stock>0 即有组合可买）→ 拒；
        // 选了组合 → 组合必须不存在或售罄才可登记
        if (!hasSelection) throw badRequest(IN_STOCK_MSG);
        const variants = variantRows.map((v) => ({
          id: "probe",
          attributes: parseVariantAttributes(v.attributes),
          stock: v.stock,
          isActive: true as const,
        }));
        const variant = findVariant(variants, normalizeSelection(registered));
        if (variant && variant.stock > 0) throw badRequest(IN_STOCK_MSG);
      } else if (!hasSoldOutSpecValue(product.specStock, registered)) {
        throw badRequest(IN_STOCK_MSG);
      }
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

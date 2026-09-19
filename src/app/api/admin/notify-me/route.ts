import { apiHandler, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

export const runtime = "nodejs";

/** GET /api/admin/notify-me — 到货通知订阅列表（联出客户关注的商品信息） */
export const GET = apiHandler(async () => {
  await requireStaff();
  const rows = await prisma.notifyMe.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  // NotifyMe 与 Product 无外键关系，手动联表补商品名/图片
  const productIds = [...new Set(rows.map((r) => r.productId).filter((v): v is string => !!v))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, nameEn: true, slug: true, images: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  return json({
    items: rows.map((r) => ({
      ...r,
      product: r.productId ? (productMap.get(r.productId) ?? null) : null,
    })),
  });
});

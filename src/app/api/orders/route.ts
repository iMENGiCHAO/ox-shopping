import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createOrder, createPaymentUrl, expireStaleOrders } from "@/server/services/order.service";
import { serializeOrder } from "@/server/serializers";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { orderCreateSchema } from "@/lib/validations/cart-order";
import type { OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

/** GET /api/orders — 我的订单列表 */
export const GET = apiHandler(async (req) => {
  const user = await requireUser();
  await expireStaleOrders();

  const sp = new URL(req.url).searchParams;
  const status = searchParam(sp, "status");
  const statusFilter =
    status && (ORDER_STATUSES as string[]).includes(status) ? (status as OrderStatus) : undefined;

  const { page, pageSize, skip, take } = parsePagination(sp);
  const where: Prisma.OrderWhereInput = { userId: user.id };
  if (statusFilter) where.status = statusFilter;

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);

  return jsonPaginated(rows.map(serializeOrder), {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

/** POST /api/orders — 创建订单并生成支付链接 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, orderCreateSchema);

  const order = await createOrder({
    userId: user.id,
    items: input.items,
    addressId: input.addressId,
    couponCode: input.couponCode ?? null,
    shippingMethod: input.shippingMethod ?? "standard",
    note: input.note ?? null,
  });

  // 支付地址生成失败不阻断下单
  let paymentUrl: string | null = null;
  try {
    paymentUrl = await createPaymentUrl(order, user.email);
  } catch {
    paymentUrl = null;
  }

  return json({ order: serializeOrder(order), paymentUrl });
});

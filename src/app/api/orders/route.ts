import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import {
  createOrder,
  createPaymentUrl,
  type OrderWithItems,
} from "@/server/services/order.service";
import { CouponRejectError } from "@/server/services/coupon.service";
import { couponReasonMessage } from "@/lib/coupon";
import { getT } from "@/lib/shop-i18n-server";
import { formatUsdInRequestCurrency } from "@/lib/server/money-server";
import { serializeOrder } from "@/server/serializers";
import { prisma } from "@/lib/prisma";
import { parsePagination } from "@/lib/utils";
import { orderCreateSchema } from "@/lib/validations/cart-order";
import type { OrderStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/server/utils-server";
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

/** GET /api/orders — 我的订单列表（仅登录用户；游客订单通过 /orders/[n]?token= 访问） */
export const GET = apiHandler(async (req) => {
  const user = await requireUser();

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

/**
 * POST /api/orders — 创建订单并生成支付链接。
 *
 * 登录态为**可选**（对齐 shop.x.com 结账页的 `Contact + Sign in` 形态）：
 *   - 已登录：按 addressId 取本人地址；也可改传 shippingAddress 用一次性新地址
 *   - 未登录：必须提供 contactEmail + shippingAddress，订单记 userId=null
 *     并下发 accessToken，凭 `/orders/[orderNumber]?token=…` 免登录查单
 */
export const POST = apiHandler(async (req) => {
  const user = await getSessionUser();
  const input = await readJson(req, orderCreateSchema);

  // 防刷单：登录用户按 userId 限流；游客没有稳定身份，退到 IP 维度限流
  const rlKey = user ? `order-create:${user.id}` : `order-create-ip:${getClientIp(req)}`;
  const rl = await rateLimit({ key: rlKey, limit: 5, windowSeconds: 600 });
  if (!rl.ok) throw rateLimited();

  // 已登录时忽略前端传来的 contactEmail，一律以账号邮箱为准（防止伪造收件人）
  const contactEmail = user ? user.email : (input.contactEmail ?? null);

  let order: OrderWithItems;
  try {
    order = await createOrder({
      userId: user?.id ?? null,
      contactEmail,
      items: input.items,
      // 二者都往下传，由服务端判定优先级（addressId 优先；游客单无 userId 时 addressId 会被拒）
      addressId: input.addressId ?? null,
      shippingAddress: input.shippingAddress ?? null,
      shippingMethod: input.shippingMethod ?? "standard",
      note: input.note ?? null,
      channelCode: input.channelCode ?? null,
      couponCode: input.couponCode ?? null,
    });
  } catch (err) {
    // 券校验失败：把原因码翻成当前语言的文案。
    // 与结账页「应用」按钮共用同一套词典（@/lib/coupon），
    // 杜绝「预览说已过期、下单说门槛不够」这类前后端口径不一致。
    if (err instanceof CouponRejectError) {
      const t = await getT();
      // 差额按**当前请求的结算币种**渲染（服务端算出来的是 USD 基础金额）
      const shortfall =
        err.reason === "MIN_SPEND" && err.shortfallUsd != null
          ? await formatUsdInRequestCurrency(err.shortfallUsd)
          : undefined;
      throw badRequest(couponReasonMessage(err.reason, t, shortfall));
    }
    throw err;
  }

  // 支付地址生成失败不阻断下单
  let paymentUrl: string | null = null;
  try {
    paymentUrl = await createPaymentUrl(order, contactEmail ?? "");
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, orderId: order.id, userId: user?.id ?? null },
      "[orders] 支付地址生成失败（已容错）",
    );
    paymentUrl = null;
  }

  return json({
    order: serializeOrder(order),
    paymentUrl,
    /**
     * 游客订单查询令牌。仅在「刚创建成功」这一次返回给下单人本人，
     * 供前端跳到订单详情页；serializeOrder 会刻意剥掉该字段，
     * 避免出现在订单列表 / 后台列表等任何列表响应里。
     */
    orderToken: order.accessToken ?? null,
  });
});

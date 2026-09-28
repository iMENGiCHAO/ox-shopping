import { forbidden } from "@/lib/errors";
import { apiHandler, json, jsonPaginated, readJson, searchParam } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limits";
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
import { distributionBridge } from "@/server/services/distribution/bridge";
import { DIST_REF_COOKIE } from "@/lib/distribution/contract";
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

  return jsonPaginated(
    rows.map((o) => serializeOrder(o)),
    {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  );
});

/**
 * POST /api/orders — 创建订单并生成支付链接。
 *
 * 登录态为**可选**（对齐 上游参考站 结账页的 `Contact + Sign in` 形态）：
 *   - 已登录：按 addressId 取本人地址；也可改传 shippingAddress 用一次性新地址
 *   - 未登录：必须提供 contactEmail + shippingAddress，订单记 userId=null
 *     并下发 accessToken，凭 `/orders/[orderNumber]?token=…` 免登录查单
 */
export const POST = apiHandler(async (req) => {
  const user = await getSessionUser();
  const input = await readJson(req, orderCreateSchema);

  // 防刷单：登录用户按 userId 限流；游客没有稳定身份，退到 IP/指纹维度限流。
  // 另加全站熔断（300 单/10 分钟），防游客标识轮换绕过单桶限额刷单。
  const rlKey = user ? `order-create:${user.id}` : `order-create-ip:${getClientIp(req)}`;
  const rl = await rateLimit({
    key: rlKey,
    ...RATE_LIMITS.orderCreate,
    breakerKey: user ? undefined : RATE_LIMITS.orderCreate.breakerKey,
  });
  if (!rl.ok) throw rateLimited();

  // 安全审计 D2（高危）：邮箱未验证不得下单 —— 未验证邮箱意味着订单确认信/发货通知/
  // 退款通知全部可能寄到不存在或他人信箱，客诉与坏账都无法处理。注册后验证前
  // 的窗口用「重新发送验证邮件」出口（/api/auth/verify-email/resend）放行。
  if (user && !user.emailVerified) {
    throw forbidden(
      "Please verify your email address before placing an order. Check your inbox for the verification link.",
    );
  }

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
      // 下单幂等键（边界审计）：此前 schema/service/前端都接了、唯独这里漏传 ——
      // orders.idempotencyKey 恒 NULL，唯一索引形同虚设，双击/重试仍会开两张单。
      idempotencyKey: input.idempotencyKey ?? undefined,
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

  // 分销（隔离模块）：写订单归属快照（自然流量单也会落一条 natural 记录）。
  // 走 bridge 接口：开关关闭时零开销、内部异常一律吞掉，绝不影响下单结果。
  await distributionBridge.onOrderCreated({
    orderId: order.id,
    userId: user?.id ?? null,
    refCookie: req.cookies.get(DIST_REF_COOKIE)?.value ?? null,
    req,
  });

  // 支付地址生成失败不阻断下单
  // COD（货到付款）订单无线上支付环节：创建后即 PROCESSING，跳过支付地址生成
  // （否则 createPaymentUrl 会因状态检查抛错、顾客被带去线上支付页）
  let paymentUrl: string | null = null;
  try {
    paymentUrl = order.isCashOnDelivery ? null : await createPaymentUrl(order, contactEmail ?? "");
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
    /** 订单已创建，但第三方支付初始化失败；前端应进入订单详情而不是重复下单。 */
    paymentInitializationFailed: !order.isCashOnDelivery && paymentUrl === null,
  });
});

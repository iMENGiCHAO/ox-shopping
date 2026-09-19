import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import { forbidden, unauthorized } from "@/lib/errors";
import {
  getOrderByNumber,
  isOrderTokenValid,
  type OrderWithItems,
} from "@/server/services/order.service";

/**
 * 订单访问鉴权 —— 登录单与游客单的**统一入口**。
 *
 * 规则：
 *   - 登录单（order.userId 非空）：必须本人；未登录返回 401 让前端去登录
 *   - 游客单（order.userId 为空）：必须携带匹配的查询令牌，令牌来自
 *     订单确认信里的链接（`/orders/<n>?token=…`），也可用 `x-order-token` 头传
 *
 * 令牌比较走常量时间（isOrderTokenValid），且失败与「订单不存在」对外表现一致，
 * 避免攻击者用错误差异枚举有效订单号。
 *
 * 返回值里的 `user` 对游客单为 null，调用方必须自己处理（例如审计的 userId、
 * 退款的归属用户、发票抬头等）。
 */
export interface OrderAccessResult {
  order: OrderWithItems;
  /** 登录用户；游客单为 null */
  user: Awaited<ReturnType<typeof getSessionUser>>;
}

/** 从请求中提取游客查询令牌（query 优先，其次请求头） */
export function extractOrderToken(req: Request): string | null {
  const fromQuery = new URL(req.url).searchParams.get("token");
  if (fromQuery) return fromQuery;
  return req.headers.get("x-order-token");
}

export async function requireOrderAccess(
  req: Request,
  orderNumber: string,
): Promise<OrderAccessResult> {
  // 先取订单：不存在直接 404（与令牌无关，不泄露额外信息）
  const order = await getOrderByNumber(orderNumber);
  const user = await getSessionUser();

  if (order.userId) {
    if (!user) throw unauthorized();
    if (user.id !== order.userId) throw forbidden();
    return { order, user };
  }

  if (!isOrderTokenValid(order, extractOrderToken(req))) throw forbidden();
  return { order, user: null };
}

/**
 * 下单人展示信息（发票抬头 / 邮件称呼用）。
 * 登录单取账号信息，游客单取订单快照里的收货人姓名与联系邮箱。
 */
export function orderContact(order: OrderWithItems): { name: string; email: string } {
  const snapshot = order.addressSnapshot as { recipientName?: string } | null;
  return {
    name: snapshot?.recipientName?.trim() || "Customer",
    email: order.contactEmail ?? "",
  };
}

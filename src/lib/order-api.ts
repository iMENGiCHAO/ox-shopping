/**
 * 订单相关 API 地址拼装（客户端可用，零副作用）。
 *
 * 为什么需要它：游客订单没有账号，访问凭据是**订单查询令牌**
 * （见 `@/server/services/order-access` 的 requireOrderAccess）。
 * 因此订单详情页上所有子接口调用都必须把这个令牌带上，
 * 否则游客点「取消订单」「申请退款」「下载发票」一律 403。
 *
 * 登录单传 `token = null`，拼出来就是原来的地址，行为完全不变。
 */
export function orderApiUrl(
  orderNumber: string,
  token?: string | null,
  suffix = "",
): string {
  const base = `/api/orders/${encodeURIComponent(orderNumber)}${suffix}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

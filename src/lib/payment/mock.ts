import "server-only";
import { env } from "@/lib/env";

/**
 * 模拟支付(降级方案)：
 * 未配置 Stripe 时使用，跳转到站内 /checkout/mock/:orderNumber 页面，
 * 用户点击“模拟支付”后由 /api/orders/:orderNumber/mock-pay 标记订单已支付。
 * 保证本地开发/演示环境全流程可运行。
 *
 * 游客单必须把查询令牌带在 URL 上：模拟支付页要凭它调用 mock-pay / cancel，
 * 否则游客走到这一步会 403，整个游客结账链路断在这里。
 */
export function createMockPaymentUrl(orderNumber: string, accessToken?: string | null): string {
  const base = `${env.SITE_URL}/checkout/mock/${orderNumber}`;
  return accessToken ? `${base}?token=${encodeURIComponent(accessToken)}` : base;
}

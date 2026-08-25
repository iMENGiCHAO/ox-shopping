import "server-only";
import { env } from "@/lib/env";

/**
 * 模拟支付(降级方案)：
 * 未配置 Stripe 时使用，跳转到站内 /checkout/mock/:orderNumber 页面，
 * 用户点击“模拟支付”后由 /api/orders/:orderNumber/mock-pay 标记订单已支付。
 * 保证本地开发/演示环境全流程可运行。
 */
export function createMockPaymentUrl(orderNumber: string): string {
  return `${env.SITE_URL}/checkout/mock/${orderNumber}`;
}

import "server-only";
import { createMockPaymentUrl } from "@/lib/payment/mock";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RefundInput,
} from "@/lib/payment/provider";

/**
 * MockProvider —— 开发阶段模拟支付。
 * createPayment 跳转到站内 /checkout/mock/:orderNumber，用户点「模拟支付成功」后
 * 由 /api/orders/:orderNumber/mock-pay 标记已支付；不走异步回调（verifyNotify 恒为 null），
 * 退款直接成功。
 */
export const mockProvider: PaymentProvider = {
  key: "mock",

  isConfigured() {
    // mock 无需任何配置即视为可用
    return true;
  },

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return { kind: "mock", url: createMockPaymentUrl(input.orderNumber) };
  },

  async verifyNotify() {
    return null;
  },

  async refund(input: RefundInput) {
    return { gatewayRefundId: `mock_refund_${input.orderNumber}` };
  },
};
import { apiHandler } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { assertOrderOwner, getOrderByNumber } from "@/server/services/order.service";
import { generateInvoicePdf } from "@/lib/invoice";
import { routeParam } from "@/app/api/_lib/params";
import type { OrderStatus } from "@prisma/client";

export const runtime = "nodejs";

const DOWNLOADABLE: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED"];

/** GET /api/orders/[orderNumber]/invoice — 下载 PDF 发票 */
export const GET = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);

  const order = await getOrderByNumber(orderNumber);
  assertOrderOwner(order, user.id);

  if (!DOWNLOADABLE.includes(order.status)) throw badRequest("订单未支付");

  const buffer = await generateInvoicePdf({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    tax: Number(order.tax),
    discount: Number(order.discount),
    total: Number(order.total),
    customerName: user.name,
    customerEmail: user.email,
    address: order.addressSnapshot as {
      recipientName?: string;
      phone?: string;
      province?: string;
      city?: string;
      district?: string;
      detail?: string;
    } | null,
    items: order.items.map((i) => ({
      productName: i.productName,
      sku: i.sku,
      price: Number(i.price),
      quantity: i.quantity,
      subtotal: Number(i.subtotal),
    })),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${order.orderNumber}.pdf"`,
    },
  });
});

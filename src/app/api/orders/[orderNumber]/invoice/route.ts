import { apiHandler } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { requireOrderAccess, orderContact } from "@/server/services/order-access";
import { generateInvoicePdf } from "@/lib/invoice";
import { routeParam } from "@/app/api/_lib/params";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getLang } from "@/lib/shop-i18n-server";
import type { OrderStatus } from "@prisma/client";

export const runtime = "nodejs";

const DOWNLOADABLE: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED"];

/** GET /api/orders/[orderNumber]/invoice — 下载 PDF 发票 */
export const GET = apiHandler(async (req, ctx) => {
  const orderNumber = routeParam(ctx.params.orderNumber);
  const { order, user } = await requireOrderAccess(req, orderNumber);

  if (!DOWNLOADABLE.includes(order.status)) throw badRequest("Order has not been paid");

  // 发票语言跟随当前站点语言；抬头品牌名取后台「站点设置 → 站点名称」
  const [lang, settings] = await Promise.all([getLang(), getSiteSettings()]);

  const buffer = await generateInvoicePdf({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    tax: Number(order.tax),
    discount: Number(order.discount),
    total: Number(order.total),
    // 发票抬头：登录单用账号信息，游客单用订单收货人 + 联系邮箱
    customerName: user?.name ?? orderContact(order).name,
    customerEmail: user?.email ?? orderContact(order).email,
    siteName: pickLang(settings.siteName, lang),
    lang,
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

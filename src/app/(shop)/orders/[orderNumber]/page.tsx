import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { RefundStatus } from "@prisma/client";
import { Download, MapPin, Package, Receipt, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { REFUNDABLE_STATUSES } from "@/lib/order-status";
import { isOrderTokenValid } from "@/server/services/order.service";
import { orderApiUrl } from "@/lib/order-api";
import {formatOrderAmount } from "@/components/shop/currency-server";
import { formatSpecValues } from "@/components/shop/types";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { OrderActions } from "@/components/shop/order-actions";
import { OrderReviewSection } from "@/components/shop/review-form";
import { OrderStatusTimeline } from "@/components/shop/order-status-timeline";
import { RefundEntry } from "@/components/shop/refund-entry";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
  /** 游客订单凭 `?token=` 访问（令牌来自订单确认信里的链接） */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(props: OrderDetailPageProps): Promise<Metadata> {
  const params = await props.params;
  const orderNumber = Array.isArray(params.orderNumber)
    ? params.orderNumber[0]
    : params.orderNumber;
  return { title: `Order ${orderNumber}` };
}

/** Order detail (server): timeline, items, address snapshot, shipping, totals, actions */
export default async function OrderDetailPage(props: OrderDetailPageProps) {
  const params = await props.params;
  const orderNumber = Array.isArray(params.orderNumber)
    ? params.orderNumber[0]
    : params.orderNumber;
  const user = await getSessionUser();
  const t = await getT();
  const sp = await props.searchParams;
  const rawToken = sp.token;
  const token = typeof rawToken === "string" ? rawToken : null;

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order) notFound();
  // notFound() 在 next/* .d.ts 缺失时不被识别为 never，显式 throw 帮 TS narrow
  if (!order) throw new Error("order not found");

  // 访问鉴权（与 /api/orders/* 同口径，见 @/server/services/order-access）：
  //  - 登录单：必须本人；未登录先去登录，登录后自动回到本页
  //  - 游客单：必须携带匹配的查询令牌；缺失或不匹配一律 notFound()，
  //    不暴露「订单是否存在」的差异（否则可枚举有效订单号）
  if (order.userId) {
    if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/orders/${orderNumber}`)}`);
    if (order.userId !== user.id) notFound();
  } else if (!isOrderTokenValid(order, token)) {
    notFound();
  }
  // 游客单：把令牌透传给客户端组件（取消/支付/退款/发票等子接口都要带它）
  const orderToken = order.userId ? null : token;

  const address = order.addressSnapshot as {
    recipientName?: string;
    phone?: string;
    province?: string;
    city?: string;
    district?: string;
    detail?: string;
  } | null;

  const refundable = REFUNDABLE_STATUSES.includes(order.status);
  // 活跃退款（审核中 / 已通过待打款）→ 回传前端展示状态，禁止重复申请
  const refunds = await prisma.refund.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
  });
  const activeRefund = refunds.find((r) => r.status === "REQUESTED" || r.status === "APPROVED") ?? null;
  const canDownloadInvoice = order.status !== "PENDING_PAYMENT" && order.status !== "CANCELLED";
  // 使用订单创建时的币种与汇率快照，而非当前用户币种
  const orderCurrency = order.currency ?? "USD";
  const orderRate = Number(order.exchangeRate) || 1;
  const isCOD = order.isCashOnDelivery === true;
  const codFee = order.codFee == null ? 0 : Number(order.codFee);
  const [subtotalText, shippingText, taxText, totalText, itemSubtotals, codFeeText, dueOnDeliveryText] =
    await Promise.all([
      Promise.resolve(formatOrderAmount(Number(order.subtotal), orderCurrency, orderRate)),
      Promise.resolve(formatOrderAmount(Number(order.shippingFee), orderCurrency, orderRate)),
      Promise.resolve(formatOrderAmount(Number(order.tax), orderCurrency, orderRate)),
      Promise.resolve(formatOrderAmount(Number(order.total), orderCurrency, orderRate)),
      Promise.all(order.items.map((item) =>
        Promise.resolve(formatOrderAmount(Number(item.subtotal), orderCurrency, orderRate)),
      )),
      Promise.resolve(formatOrderAmount(codFee, orderCurrency, orderRate)),
      Promise.resolve(formatOrderAmount(Number(order.total) + codFee, orderCurrency, orderRate)),
    ]);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      {/* Order header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("Order detail")}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {t("Order #")}
            {order.orderNumber}
          </p>
        </div>
        <StatusBadge
          status={order.status}
          labelMap={{
            PENDING_PAYMENT: t("Payment pending"),
            PAID: t("Paid"),
            PROCESSING: t("Processing"),
            SHIPPED: t("Shipped"),
            DELIVERED: t("Delivered"),
            CANCELLED: t("Cancelled"),
            REFUNDED: t("Refunded"),
          }}
        />
      </div>

      {/* Status timeline + actions */}
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Order progress")}</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderStatusTimeline
              order={{
                status: order.status,
                createdAt: order.createdAt,
                paidAt: order.paidAt,
                shippedAt: order.shippedAt,
                deliveredAt: order.deliveredAt,
                cancelledAt: order.cancelledAt,
                refundedAt: order.refundedAt,
                isCashOnDelivery: isCOD,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Order actions")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <OrderActions
              orderNumber={order.orderNumber}
              status={order.status}
              isCashOnDelivery={isCOD}
              token={orderToken}
              className="flex flex-col gap-2"
            />
            {order.status === "PENDING_PAYMENT" && !isCOD ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Please pay as soon as possible — unpaid orders are auto-cancelled when they time out.",
                )}
              </p>
            ) : null}
            {isCOD ? (
              <p className="text-xs text-muted-foreground">
                {t("Cash on delivery — pay the courier when your order arrives.")}
              </p>
            ) : null}
            {canDownloadInvoice ? (
              <Button asChild variant="outline" size="sm" className="w-full">
                <a
                  href={orderApiUrl(order.orderNumber, orderToken, "/invoice")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {t("Download invoice")}
                </a>
              </Button>
            ) : null}
            <RefundEntry
              orderNumber={order.orderNumber}
              token={orderToken}
              total={Number(order.total)}
              refundable={refundable}
              currency={order.currency}
              exchangeRate={Number(order.exchangeRate)}
              activeRefundStatus={(activeRefund?.status as RefundStatus | undefined) ?? null}
            />
          </CardContent>
        </Card>
      </div>

      {/* 确认收货后可评价（内部自带可评判断：非 DELIVERED/游客单静默不渲染） */}
      <OrderReviewSection orderNumber={order.orderNumber} />

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            {t("Items list")}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {order.items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 py-3 text-sm">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <ImageWithFallback
                  src={item.productImage ?? undefined}
                  alt={item.productName}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("SKU:")} {item.sku}
                </p>
                {Array.isArray(item.attributes) &&
                (item.attributes as { name: string; value: string }[]).length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatSpecValues(item.attributes as { name: string; value: string }[])}
                  </p>
                ) : null}
              </div>
              <span className="text-muted-foreground">× {item.quantity}</span>
              <span className="w-24 text-right font-medium">{itemSubtotals[i]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* address + Shipping */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              {t("Shipping address")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">
              {address?.recipientName ?? "-"}{" "}
              <span className="ml-2 font-normal text-muted-foreground">{address?.phone ?? ""}</span>
            </p>
            <p className="text-muted-foreground">
              {address
                ? `${address.province ?? ""} ${address.city ?? ""} ${address.district ?? ""} ${address.detail ?? ""}`
                : "-"}
            </p>
            {order.note ? (
              <p className="pt-2 text-muted-foreground">
                <span className="text-foreground">{t("Order notes: ")} </span>
                {order.note}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              {t("Logistics")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {order.trackingCompany || order.trackingNumber ? (
              <>
                <p>
                  {t("Shipping company: ")}
                  <span className="text-muted-foreground">{order.trackingCompany ?? "-"}</span>
                </p>
                <p>
                  {t("Tracking No.:")}
                  <span className="font-mono text-muted-foreground">
                    {" "}
                    {order.trackingNumber ?? "-"}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                {order.status === "PENDING_PAYMENT"
                  ? t("We will ship as soon as the order is paid")
                  : t("No tracking info yet — please wait")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Amount details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            {t("Amount details")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Subtotal")}</dt>
              <dd>{subtotalText}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Shipping")}</dt>
              <dd>
                {/* COD 单 shippingFee=0 是占位（运费不计入在线总额）——绝不能显示「免邮」，
                    顾客要在收货时向承运商现金支付到付费 */}
                {isCOD
                  ? codFee > 0
                    ? `${t("Pay on delivery")} (${codFeeText})`
                    : t("Pay on delivery")
                  : Number(order.shippingFee) === 0
                    ? t("Free shipping")
                    : shippingText}
              </dd>
            </div>
            {Number(order.tax) > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("Tax")}</dt>
                <dd>{taxText}</dd>
              </div>
            ) : null}
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <dt>{t("Order total")}</dt>
              <dd className="text-xl font-normal text-foreground">{totalText}</dd>
            </div>
            {isCOD ? (
              <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
                <dt>{t("Due on delivery (cash)")}</dt>
                <dd>{dueOnDeliveryText}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

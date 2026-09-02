import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Download, ExternalLink, MapPin, Package, Receipt, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { REFUNDABLE_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { formatPrice } from "@/components/shop/currency-server";
import { formatSpecs } from "@/components/shop/types";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { OrderActions } from "@/components/shop/order-actions";
import { OrderStatusTimeline } from "@/components/shop/order-status-timeline";
import { RefundEntry } from "@/components/shop/refund-entry";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

/** 常见承运商 → 物流查询 URL（自动按承运商名匹配） */
function getTrackingUrl(company: string | null, number: string): string {
  const c = (company ?? "").toLowerCase();
  if (/sf|顺丰|shunfeng/.test(c)) {
    return `https://www.sf-express.com/track?nums=${encodeURIComponent(number)}`;
  }
  if (/yto|圆通|yuantong/.test(c)) {
    return `https://www.yto.net.cn/query?waybillNo=${encodeURIComponent(number)}`;
  }
  if (/zto|中通|zhongtong/.test(c)) {
    return `https://www.zto.com/track?billno=${encodeURIComponent(number)}`;
  }
  if (/sto|申通|shentong/.test(c)) {
    return `https://www.sto.cn/track?waybillNo=${encodeURIComponent(number)}`;
  }
  if (/yd|韵达|yunda/.test(c)) {
    return `https://www.yundaex.com/track?waybillNo=${encodeURIComponent(number)}`;
  }
  if (/j&j|京东|jd\.com/.test(c)) {
    return `https://www.jdl.com/track?waybillCodes=${encodeURIComponent(number)}`;
  }
  if (/usps|ups|fedex|dhl|tnt|ems/.test(c)) {
    // 国际通用
    return `https://www.17track.net/zh-cn/?nums=${encodeURIComponent(number)}`;
  }
  // 兜底 17track（万能查单）
  return `https://www.17track.net/zh-cn/?nums=${encodeURIComponent(number)}`;
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
  if (!user) redirect(`/auth/login?next=/orders/${orderNumber}`);
  // redirect() 在 next/* .d.ts 缺失时不被识别为 never，显式 throw 帮 TS narrow
  if (!user) throw new Error("unreachable");
  const t = await getT();
  const lang = t("__lang__") === "zh" ? "zh" : "en";

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });
  if (!order || order.userId !== user.id) notFound();
  // notFound() 在 next/* .d.ts 缺失时不被识别为 never，显式 throw 帮 TS narrow
  if (!order) throw new Error("order not found");

  const address = order.addressSnapshot as {
    recipientName?: string;
    phone?: string;
    province?: string;
    city?: string;
    district?: string;
    detail?: string;
  } | null;

  const refundable = REFUNDABLE_STATUSES.includes(order.status);
  const canDownloadInvoice = order.status !== "PENDING_PAYMENT" && order.status !== "CANCELLED";
  const [subtotalText, discountText, shippingText, taxText, totalText, itemSubtotals] =
    await Promise.all([
      formatPrice(Number(order.subtotal)),
      formatPrice(Number(order.discount)),
      formatPrice(Number(order.shippingFee)),
      formatPrice(Number(order.tax)),
      formatPrice(Number(order.total)),
      Promise.all(order.items.map((item) => formatPrice(Number(item.subtotal)))),
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
          labelMap={
            Object.fromEntries(
              Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => [k, t(v)]),
            ) as Record<string, string>
          }
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
              className="flex flex-col gap-2"
            />
            {order.status === "PENDING_PAYMENT" ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Please pay as soon as possible — unpaid orders are auto-cancelled when they time out.",
                )}
              </p>
            ) : null}
            {canDownloadInvoice ? (
              <Button asChild variant="outline" size="sm" className="w-full">
                <a
                  href={`/api/orders/${order.orderNumber}/invoice`}
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
              total={Number(order.total)}
              refundable={refundable}
            />
          </CardContent>
        </Card>
      </div>

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
                    {formatSpecs(item.attributes as { name: string; value: string }[])}
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
                {order.trackingNumber ? (
                  <a
                    href={getTrackingUrl(order.trackingCompany, order.trackingNumber)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {lang === "zh" ? "查询物流轨迹" : "Track shipment"}
                  </a>
                ) : null}
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
            {Number(order.discount) > 0 ? (
              <div className="flex justify-between text-success">
                <dt>{t("Discount")}</dt>
                <dd>-{discountText}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("Shipping")}</dt>
              <dd>{Number(order.shippingFee) === 0 ? t("Free shipping") : shippingText}</dd>
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
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

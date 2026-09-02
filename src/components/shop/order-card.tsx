import Link from "next/link";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPrice } from "@/components/shop/currency-server";
import { OrderActions } from "@/components/shop/order-actions";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { firstImage } from "@/components/shop/types";
import { formatSpecs } from "@/components/shop/types";
import { getT } from "@/lib/shop-i18n-server";

export interface OrderCardItemData {
  productName: string;
  productImage: string | null;
  quantity: number;
  price: number | string;
  productId?: string | null;
  attributes?: { name: string; value: string }[];
}

export interface OrderCardData {
  orderNumber: string;
  status: string;
  createdAt: string | Date;
  total: number | string;
  currency?: string;
  items: OrderCardItemData[];
}

/** Order card (order list page, server-render) */
export async function OrderCard({ order }: { order: OrderCardData }) {
  const t = await getT();
  const t2 = t as (key: string, params?: Record<string, string | number>) => string;
  const lang = t("__lang__") === "zh" ? "zh" : "en";
  const dateLocale = lang === "zh" ? zhCN : enUS;
  const totalText = await formatPrice(Number(order.total));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono font-medium">{order.orderNumber}</span>
          <span className="text-muted-foreground">
            {format(new Date(order.createdAt), "yyyy-MM-dd HH:mm", { locale: dateLocale })}
          </span>
        </div>
        <StatusBadge status={order.status} labelMap={Object.fromEntries(
          Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => [k, t2(v)])
        ) as Record<string, string>} />
      </CardHeader>
      <CardContent className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {order.items.slice(0, 4).map((item, i) => (
            <div
              key={`${item.productId ?? item.productName}-${i}`}
              className="relative h-16 w-16 overflow-hidden border border-border bg-secondary"
            >
              <ImageWithFallback
                src={firstImage(item.productImage ? [item.productImage] : null) ?? undefined}
                alt={item.productName}
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
          ))}
          {order.items.length > 4 ? (
            <span className="text-xs text-muted-foreground">
              {t2("{n} items", { n: order.items.length })}
            </span>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
          {order.items
            .map(
              (i) =>
                `${i.productName}${formatSpecs(i.attributes) ? `(${formatSpecs(i.attributes)})` : ""} × ${i.quantity}`,
            )
            .join(", ")}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <div className="text-sm">
          {t2("Total:")}{" "}
          <span className="text-base font-normal text-foreground">
            {totalText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <OrderActions orderNumber={order.orderNumber} status={order.status} />
          <Button asChild variant="outline" size="sm">
            <Link href={`/orders/${order.orderNumber}`}>{t2("View details")}</Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

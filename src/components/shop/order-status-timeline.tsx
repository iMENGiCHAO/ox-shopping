import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@prisma/client";
import { getT } from "@/lib/shop-i18n-server";

export interface OrderTimelineData {
  status: OrderStatus;
  createdAt: string | Date;
  paidAt?: string | Date | null;
  shippedAt?: string | Date | null;
  deliveredAt?: string | Date | null;
  cancelledAt?: string | Date | null;
  refundedAt?: string | Date | null;
  /**
   * 货到付款（COD）：无线上支付环节，paidAt 恒为 null。
   * 「支付」步骤改为「货到付款」，在送达（现金收讫）时点亮。
   */
  isCashOnDelivery?: boolean;
}

interface TimelineStep {
  key: string;
  label: string;
  time?: string | Date | null;
}

/** Order status timeline (server-render) */
export async function OrderStatusTimeline({ order }: { order: OrderTimelineData }) {
  const t = await getT();
  const lang = t("__lang__") === "zh" ? "zh" : "en";
  const dateLocale = lang === "zh" ? zhCN : enUS;
  const steps: TimelineStep[] = [
    { key: "created", label: t("Order placed"), time: order.createdAt },
    {
      key: "paid",
      // COD（货到付款）：paidAt 恒为 null——该步改为「货到付款」，送达现金收讫时点亮
      label: order.isCashOnDelivery ? t("Cash on Delivery") : t("Payment received"),
      time: order.isCashOnDelivery ? (order.deliveredAt ?? null) : order.paidAt,
    },
    { key: "shipped", label: t("Shipped"), time: order.shippedAt },
    { key: "delivered", label: t("Confirm receipt"), time: order.deliveredAt },
  ];
  if (order.cancelledAt) {
    steps.push({ key: "cancelled", label: t("Order cancelled"), time: order.cancelledAt });
  }
  if (order.refundedAt) {
    steps.push({ key: "refunded", label: t("Refunded"), time: order.refundedAt });
  }

  const reached = (time?: string | Date | null) => !!time;

  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = reached(step.time);
        const isLast = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast ? (
              <span
                className={cn(
                  "absolute left-[9px] top-5 h-full w-0.5",
                  done ? "bg-success/60" : "bg-muted",
                )}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                done ? "border-success bg-success/10" : "border-muted bg-muted/40",
              )}
              aria-hidden="true"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  done ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", done ? "" : "text-muted-foreground")}>
                {step.label}
              </p>
              {step.time ? (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(step.time), "yyyy-MM-dd HH:mm", { locale: dateLocale })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/70">{t("Pending")}</p>
              )}
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-muted-foreground">
        {t("Current status:")}{" "}
        {t(
          {
            PENDING_PAYMENT: "Payment pending",
            PAID: "Paid",
            PROCESSING: "Processing",
            SHIPPED: "Shipped",
            DELIVERED: "Delivered",
            CANCELLED: "Cancelled",
            REFUNDED: "Refunded",
          }[order.status] ?? order.status,
        )}
      </li>
    </ol>
  );
}

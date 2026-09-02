import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CouponCodeCopy } from "@/components/shop/coupon-code-copy";
import { toNumberPrice, type CouponData } from "@/components/shop/types";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/shop-i18n-server";
import type { TFunc } from "@/lib/shop-i18n-server";

type T = TFunc;

/** Coupon description copy (by type) */
export function couponDescription(
  coupon: Pick<CouponData, "type" | "value" | "minSpend">,
  t: T,
): string {
  const value = toNumberPrice(coupon.value);
  const minSpend = toNumberPrice(coupon.minSpend);
  if (coupon.type === "PERCENTAGE") {
    const discount = (100 - value) / 10;
    return minSpend > 0
      ? t("Spend {minSpend}, get {discount}% off", { minSpend: `¥${minSpend}`, discount: String(discount) })
      : t("{discount}% off", { discount: String(discount) });
  }
  if (coupon.type === "FIXED") {
    return minSpend > 0
      ? t("Spend {minSpend}, get {value} off", { minSpend: `¥${minSpend}`, value: `¥${value}` })
      : t("{value} off", { value: `¥${value}` });
  }
  return minSpend > 0
    ? t("Spend {minSpend} for free shipping", { minSpend: String(minSpend) })
    : t("Free shipping sitewide");
}

/** Coupon card (server-render friendly; copy button is a client child) — minimal square */
export async function CouponCard({
  coupon,
  subtitle,
  className,
}: {
  coupon: CouponData;
  /** Badge text (e.g. "Used") */
  subtitle?: string;
  className?: string;
}) {
  const t = await getT();
  const start = format(new Date(coupon.startsAt), "MMM d, yyyy");
  const end = format(new Date(coupon.endsAt), "MMM d, yyyy");

  return (
    <Card
      className={cn(
        "relative overflow-hidden border border-dashed border-input bg-card",
        className,
      )}
    >
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-normal text-foreground">
              {coupon.code}
            </span>
            {subtitle ? (
              <Badge variant="outline">
                {subtitle}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-base font-normal text-foreground">
            {couponDescription(coupon, t)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("Valid: {start} to {end}", { start, end })}
          </p>
        </div>
        <CouponCodeCopy code={coupon.code} />
      </CardContent>
    </Card>
  );
}

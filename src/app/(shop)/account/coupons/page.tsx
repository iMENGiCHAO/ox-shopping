import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listActiveCoupons } from "@/server/services/product.service";
import { CouponCard } from "@/components/shop/coupon-card";
import { SectionTitle } from "@/components/shop/section-title";
import type { CouponData } from "@/components/shop/types";
import { getT } from "@/lib/shop-i18n-server";
import type { TFunc } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Coupons",
  description: "View used coupons and coupons you can claim",
};

function toCouponData(coupon: {
  id: string;
  code: string;
  type: string;
  value: unknown;
  minSpend: unknown;
  maxDiscount: unknown;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number;
  usedCount: number;
}): CouponData {
  return {
    id: coupon.id,
    code: coupon.code,
    type: (["PERCENTAGE", "FIXED", "FREE_SHIPPING"] as const).includes(coupon.type as never)
      ? (coupon.type as CouponData["type"])
      : "FIXED",
    value: Number(coupon.value),
    minSpend: Number(coupon.minSpend),
    maxDiscount: coupon.maxDiscount == null ? null : Number(coupon.maxDiscount),
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
  };
}

/** My Coupons (server) */
export default async function CouponsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account/coupons");
  const t: TFunc = getT();

  const [usedRedemptions, available] = await Promise.all([
    prisma.couponRedemption.findMany({
      where: { userId: user.id },
      include: { coupon: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    listActiveCoupons(),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle title={t("Available Coupons")} subtitle={t("Enter the coupon code at checkout to apply")} />
        {available.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-5 w-5" />}
            title={t("No coupons available right now")}
            description={t("Check the homepage coupon center — we release new coupons from time to time.")}
          />
        ) : (
          <div className="space-y-3">
            {available.map((coupon) => (
              <CouponCard key={coupon.id} coupon={toCouponData(coupon)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title={t("Used Coupons")} />
        {usedRedemptions.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t("You have not used any coupons yet")}
          </p>
        ) : (
          <div className="space-y-3">
            {usedRedemptions.map((r) => (
              <CouponCard
                key={r.id}
                coupon={toCouponData(r.coupon)}
                subtitle={t("Used · saved {amount}", { amount: Number(r.discountAmount).toFixed(2) })}
                className="opacity-70"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

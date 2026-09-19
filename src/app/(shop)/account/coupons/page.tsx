import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CouponCard } from "@/components/shop/coupon-card";
import { buildAlternates } from "@/lib/shop-i18n";
import { getT } from "@/lib/shop-i18n-server";
import { getSessionUser } from "@/lib/auth/session";
import { listPublicCoupons, listUserRedemptions } from "@/server/services/coupon.service";
import { formatMoney } from "@/lib/utils";
import type { CouponData } from "@/components/shop/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("My Coupons"), alternates: buildAlternates("/account/coupons") };
}

/**
 * /account/coupons —— 我的折扣码。
 *
 * 「可领取」只列公开券（`isPublic=true`）：定向发放的私密码不应在此泄露，
 * 否则等于把邀请码公开。私密码仍可在结账页直接输入使用。
 *
 * 「已使用」的减免金额按**订单币种**格式化（核销记录里 discountAmount 是该单币种），
 * 不与券面 USD 金额混算，避免跨币种错账。
 */
export default async function MyCouponsPage() {
  const t = await getT();
  const user = await getSessionUser();
  // account layout 已做登录守卫；此处再取一次是为了拿到 userId（TS 收窄）
  if (!user) throw new Error("unreachable");

  const [available, used] = await Promise.all([
    listPublicCoupons(),
    listUserRedemptions(user.id),
  ]);

  const cards: CouponData[] = available.map((c) => ({
    id: c.code,
    code: c.code,
    type: c.type,
    value: c.value,
    minSpend: c.minSpend,
    maxDiscount: c.maxDiscount,
    startsAt: new Date(),
    endsAt: c.endsAt,
    title: c.title,
    titleEn: c.titleEn,
    description: c.description,
    descriptionEn: c.descriptionEn,
  }));

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">{t("Available Coupons")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("Enter the discount code at checkout to apply")}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/coupons">{t("Coupon Center")}</Link>
          </Button>
        </div>
        {cards.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-5 w-5" />}
            title={t("No discount codes available right now")}
            description={t("Shop all products")}
            action={
              <Button asChild variant="outline">
                <Link href="/products">{t("Shop all products")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {cards.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium text-foreground">{t("Used Coupons")}</h2>
        {used.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            {t("You have not used any coupons yet")}
          </p>
        ) : (
          <div className="space-y-3">
            {used.map((r) => (
              <CouponCard
                key={r.id}
                coupon={{
                  id: r.coupon.id,
                  code: r.coupon.code,
                  type: r.coupon.type,
                  value: r.coupon.value,
                  minSpend: r.coupon.minSpend,
                  maxDiscount: r.coupon.maxDiscount,
                  startsAt: r.coupon.startsAt,
                  endsAt: r.coupon.endsAt,
                  title: r.coupon.title,
                  titleEn: r.coupon.titleEn,
                  description: r.coupon.description,
                  descriptionEn: r.coupon.descriptionEn,
                }}
                subtitle={t("Used · saved {amount}", {
                  amount: formatMoney(r.discountAmount, r.currency),
                })}
                className="opacity-70"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

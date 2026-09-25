import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CouponCard } from "@/components/shop/coupon-card";
import { buildAlternates } from "@/lib/shop-i18n";
import { getT } from "@/lib/shop-i18n-server";
import { listPublicCoupons } from "@/server/services/coupon.service";
import type { CouponData } from "@/components/shop/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Coupon Center"),
    description: t("Enter the discount code at checkout to apply"),
    alternates: buildAlternates("/coupons"),
  };
}

/**
 * /coupons —— 领券中心。
 *
 * 这是**自建增强页**：原站 上游参考站 只在结账页提供「Discount code + Apply」，
 * 全站没有领券中心（`/pages/coupons` 与原站 404 页字节数完全一致，确认无此页）。
 * 因此本页不改变任何原站页面的形态，只是把「运营配置的公开券」集中露出，
 * 券码仍与结账页共用同一套校验与核销逻辑（见 coupon.service）。
 *
 * 只展示 `isPublic=true`、在有效期内且未抢完的券；券的统计字段
 * （usageLimit / usedCount / perUserLimit）不下发到前台。
 */
export default async function CouponCenterPage() {
  const t = await getT();
  const coupons = await listPublicCoupons();

  const cards: CouponData[] = coupons.map((c) => ({
    id: c.code,
    code: c.code,
    type: c.type,
    value: c.value,
    minSpend: c.minSpend,
    maxDiscount: c.maxDiscount,
    // 公开券列表不返回 startsAt（对用户无意义），用当前时间占位以满足卡片契约
    startsAt: new Date(),
    endsAt: c.endsAt,
    title: c.title,
    titleEn: c.titleEn,
    description: c.description,
    descriptionEn: c.descriptionEn,
  }));

  return (
    <div className="flex-1">
      <div className="shell pb-16 pt-10 sm:pt-14">
        <header className="mb-8">
          <h1 className="text-[28px] font-normal leading-tight text-foreground">
            {t("Coupon Center")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Enter the discount code at checkout to apply")}
          </p>
        </header>

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
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {cards.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

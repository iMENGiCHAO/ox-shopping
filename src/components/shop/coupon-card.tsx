import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CouponCodeCopy } from "@/components/shop/coupon-code-copy";
import type { CouponData } from "@/components/shop/types";
import { couponDescription, couponHeadline, couponMinSpendLabel, couponTitle } from "@/lib/coupon";
import { cn } from "@/lib/utils";
import { convertPrice, formatAmount } from "@/components/shop/currency";
import { getCurrencyCode, getRateSnapshot } from "@/components/shop/currency-server";
import { getLang, getT } from "@/lib/shop-i18n-server";

/**
 * 折扣码卡片（服务端组件；复制按钮是唯一的客户端子组件）。
 *
 * 卖点/门槛/标题文案统一由 `@/lib/coupon` 的纯函数生成，金额按**访客所选币种**
 * 换算展示（与全站 PDP/购物车/结账同一套 convertPrice + formatAmount 口径），
 * 不在卡片里硬编码货币符号或折扣算法。
 */
export async function CouponCard({
  coupon,
  subtitle,
  className,
}: {
  coupon: CouponData;
  /** 右上角徽标文案（如「已使用」） */
  subtitle?: string;
  className?: string;
}) {
  const t = await getT();
  const lang = await getLang();
  // 访客币种换算（P1-5 商用审计）：此前 formatMoney 是 USD 基准不换算 ——
  // CNY 访客看到商品 ¥、券卡却是 "Save $10.00"，无法与页面价格对照；
  // EUR 下 formatMoney（符号在后）与全站 formatAmount（符号在前）两种格式混用。
  const code = await getCurrencyCode();
  const { rates } = await getRateSnapshot();
  const rate = rates[code] ?? 1;
  const money = (n: number) => formatAmount(convertPrice(n, rate), code);

  const title = couponTitle(coupon, lang);
  const description = couponDescription(coupon, lang);
  const headline = couponHeadline(coupon, t, money);
  const minSpend = couponMinSpendLabel(coupon, t, money);
  const endsAt = new Date(coupon.endsAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  /**
   * 有运营标题时：标题占主视觉，计算出的卖点下沉到 meta 行——
   * 两者都保留且不重复（否则同一句「免邮」会在卡上出现两次）。
   * 无运营标题时：计算卖点即主视觉，meta 行不再重复。
   *
   * 另需与 description 去重：运营可能把描述写成与计算卖点完全相同的句子
   * （如免邮券 descriptionEn = "Free shipping on your order"），
   * 不去重就会出现「同一句话相邻两行各一次」。
   */
  const hasTitle = title !== coupon.code;
  const primary = hasTitle ? title : headline;
  const shown = new Set(
    [primary, description].filter(Boolean).map((s) => s.trim().toLowerCase()),
  );
  const meta = [hasTitle ? headline : null, t("Valid until {date}", { date: endsAt }), minSpend]
    .filter(
      (part): part is string =>
        typeof part === "string" && part !== "" && !shown.has(part.trim().toLowerCase()),
    )
    .join(" · ");

  return (
    <Card className={cn("relative overflow-hidden border border-dashed border-input bg-card", className)}>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-normal text-foreground">{coupon.code}</span>
            {subtitle ? <Badge variant="outline">{subtitle}</Badge> : null}
          </div>
          <p className="mt-2 text-base font-normal text-foreground">{primary}</p>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
          <p className="mt-1.5 text-xs text-muted-foreground">{meta}</p>
        </div>
        <CouponCodeCopy code={coupon.code} />
      </CardContent>
    </Card>
  );
}

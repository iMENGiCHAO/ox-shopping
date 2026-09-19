import Link from "next/link";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/shop/currency-server";
import { firstImage, toNumberPrice, type ProductCardData } from "@/components/shop/types";
import { getT } from "@/lib/shop-i18n-server";
import { getLang as getServerLang } from "@/lib/shop-i18n-server";
import { pickName, localizePath } from "@/lib/shop-i18n";

/**
 * 商品卡角标。原站（2026-09-19 复核）**只有 `Sold out` 一种**，
 * 深色底白字；`Pre-order` / `Sale` / `New` / `Hot` 均不存在，故不再保留分支。
 */
function SoldOutBadge({ label }: { label: string }) {
  return (
    /* 原站实测（2026-09-20 Playwright 取 .badge--sold-out 计算样式）：
       背景 rgb(239,239,239) 浅灰、文字 rgba(0,0,0,.65)、11px、padding 1px 5px。
       此前用黑底白字（bg-black/80 text-white），大爷指正与原站不符。 */
    <span className="bg-[#efefef] px-[5px] py-[1px] text-[11px] uppercase leading-[18px] tracking-normal text-black/65">
      {label}
    </span>
  );
}

export interface ProductCardProps {
  product: ProductCardData;
  /** Prioritize loading for first screen */
  priority?: boolean;
  className?: string;
}

/**
 * Product card — shop.x.com 同款：
 * 正方形商品图、白底透明媒体、居中常规字重信息（标题与价格**同为 12px**，
 * 仅颜色不同：标题 #1C1C1C / 价格约 rgb(112,112,112)）、hover 切换到第二张图。
 *
 * 实测依据（1216 视口，参考站 /collections/all）：
 *   商品图 341×341；图底→标题字形顶 26px；标题盒 = 一个行高（20.4px）；
 *   标题字形底→价格字形顶 17px；价格字形底→下一行图顶 71px；行 pitch 470px。
 *   标题与价格的字形带高均为 9px（= 12px 字号），价格横向宽度比 15px 窄 20%。
 *
 * 注：**没有**快速加购按钮 —— 原站商品卡 hover 只换图，
 * 历史注释里的 "quick-add circle" 与实现不符，已删除。
 */
export async function ProductCard({ product, priority, className }: ProductCardProps) {
  const t = await getT();
  const lang = await getServerLang();
  const productName = pickName(product.name, product.nameEn, lang);
  const images = Array.isArray(product.images)
    ? product.images.filter((s): s is string => !!s)
    : [];
  const image = firstImage(product.images);
  const secondary = images[1];
  const price = toNumberPrice(product.price);
  const outOfStock = product.stock <= 0;
  const hasDiscount =
    product.compareAtPrice != null && toNumberPrice(product.compareAtPrice) > price;
  const priceText = await formatPrice(price);
  const compareNum = toNumberPrice(product.compareAtPrice);
  const compareText = await formatPrice(compareNum);

  /* ── 角标：原站**只有 `Sold out` 一种** ─────────────────────────────
     2026-09-19 用 WebFetch 直读原站复核（此前审计文档断言「原站不显示角标」是错的）：

       · `GET /collections/all` → 全站仅 `Sold out` 出现 2 次，分别对应
         `The Retro Tee` 与 `xAI Logo Tee`；
       · `GET /products.json` → 这两个商品的**全部变体** `available: false`，
         其余商品至少一个变体可售 → 角标判定条件 = **所有变体均不可售**；
       · `The Retro Crewneck` 同为预售品（handle 带 `-pre-sale`）但有 2 个变体可售，
         原站**没有任何角标** ⇒ 原站**不存在 `Pre-order` 角标**；
       · `The Retro Tee`（预售 + 全线缺货）显示 `Sold out`
         ⇒ **售罄优先于预售**。

     因此这里只保留 `Sold out`，且不再用 `!isPresale` 抑制它。
     原先的 `Pre-order` / `Sale` / `New` / `Hot` 角标均为本地自创（原站无），
     已移除；`isPresale` / `isNew` / `isHot` 字段本身保留（PDP、结账页仍会用到）。
     若日后确需恢复，注意它们会立刻破坏与原站的视觉一致性。 */
  const badgeLabel = outOfStock ? t("Sold out") : null;

  return (
    <Link
      href={localizePath(`/products/${product.slug}`, lang)}
      className={cn("group block", className)}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        {/* 副图层常驻底层；主图悬停淡出即换图——无交叉淡化凹陷 */}
        {secondary ? (
          <ImageWithFallback
            src={secondary}
            alt=""
            aria-hidden
            fill
            sizes="(max-width: 768px) 50vw, 33vw"
            className="pointer-events-none absolute inset-0 object-contain"
          />
        ) : null}
        <ImageWithFallback
          src={image ?? undefined}
          alt={productName}
          fill
          priority={priority}
          sizes="(max-width: 768px) 50vw, 33vw"
          className={cn(
            "pointer-events-none object-contain transition-opacity duration-200 motion-reduce:transition-none",
            secondary && "group-hover:opacity-0",
          )}
        />
        {/* 商品角标：原站仅售罄一种 */}
        {badgeLabel && (
          <div className="absolute left-2 top-2 z-10">
            <SoldOutBadge label={badgeLabel} />
          </div>
        )}
      </div>

      {/* Centered regular-weight info — x.com v-stack
          pt-5 (20px) + gap-1.5 (6px)：图底→标题字形顶实测 25px、
          标题字形底→价格字形顶实测 16px（字形相对盒边各有约 2~4px 内缩）。 */}
      <div className="flex flex-col items-center gap-1.5 pt-5 text-center">
        {/* 标题**不预留两行高度**：原站实测标题盒恰好 = 一个行高（20.4px），
            价格紧贴标题下方 17px（字形底→字形顶）。
            早期实现写了 `min-h-[41px]`（预留两行），导致每行商品卡多出 21px，
            行 pitch 492.8 而原站是 470 —— 已按实测移除。
            多行标题由 grid 行高自动撑开，与原站一致。 */}
        <h3 className="line-clamp-2 text-xs font-normal leading-[20.4px] text-foreground">
          {productName}
        </h3>
        <div className="flex items-baseline justify-center gap-2">
          {product.compareAtPrice != null && toNumberPrice(product.compareAtPrice) > price ? (
            <>
              <span className="text-xs font-normal tracking-tight text-foreground/60">
                {priceText}
              </span>
              <span className="text-[11px] text-foreground/40 line-through">{compareText}</span>
            </>
          ) : (
            <span className="text-xs font-normal tracking-tight text-foreground/60">
              {priceText}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

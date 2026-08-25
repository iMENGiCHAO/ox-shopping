import Link from "next/link";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/components/shop/currency-server";
import {
  firstImage,
  parseAttributes,
  toNumberPrice,
  type ProductCardData,
} from "@/components/shop/types";
import { ProductShareMenu } from "@/components/shop/product-share-menu";
import { getT } from "@/lib/shop-i18n-server";
import { getLang as getServerLang } from "@/lib/shop-i18n-server";
import { pickName } from "@/lib/shop-i18n";

/* Common color name → hex (for swatch display) */
const COLOR_HEX: Record<string, string> = {
  Black: "#1C1C1C",
  "Obsidian Black": "#1C1C1C",
  Charcoal: "#2D2D2D",
  "Space Gray": "#3F3F3F",
  "Dark Grey": "#3F3F3F",
  Silver: "#D4D4D4",
  "Stellar Silver": "#D4D4D4",
  White: "#FAFAFA",
  "Glacier Blue": "#A8C5D9",
  Blue: "#4A6B8A",
  Navy: "#1F2D3D",
  Red: "#B8434A",
  Green: "#5A7255",
  Olive: "#6B6730",
  Yellow: "#D4A436",
  Gold: "#B8973D",
  Purple: "#6B4D7A",
  Pink: "#D4A0B5",
  Brown: "#6B4A2D",
};

function colorHex(name: string): string {
  return COLOR_HEX[name] ?? "#D4D4D4";
}

/** 官方同款商品徽标：11px 大写、#EFEFEF 底、black/65、高约 20px */
function Badge({ label }: { label: string }) {
  return (
    <span className="bg-[#EFEFEF] px-2 py-0.5 text-[11px] uppercase leading-[18px] tracking-normal text-black/65">
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
 * Product card — shop.x.com display: square image, transparent media over white page,
 * centered regular-weight info beneath (13px title / 15px price),
 * hover swaps to the second image and slides in the quick-add circle.
 */
export async function ProductCard({ product, priority, className }: ProductCardProps) {
  const t = getT();
  const lang = getServerLang();
  const productName = pickName(product.name, product.nameEn, lang);
  const images = Array.isArray(product.images) ? product.images.filter((s): s is string => !!s) : [];
  const image = firstImage(product.images);
  const secondary = images[1];
  const parsedAttrs = parseAttributes(product.attributes);
  const colorGroup =
    parsedAttrs.find((a) => a.name === "Color" || (a.name === "Color" && a.selectable === true));
  const colorValues = colorGroup?.values.slice(0, 5) ?? [];
  const price = toNumberPrice(product.price);
  const outOfStock = product.stock <= 0;
  const priceText = await formatPrice(price);
  const compareNum = toNumberPrice(product.compareAtPrice);
  const compareText = await formatPrice(compareNum);

  return (
    <Link href={`/products/${product.slug}`} className={cn("group block", className)}>
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
        {/* 官方 badge-list--vertical：左上 8px 内缩、纵向堆叠、11px 大写 #EFEFEF 底 */}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {outOfStock && product.isPresale ? (
            <Badge label={t("Pre-order")} />
          ) : null}
          {outOfStock && !product.isPresale ? <Badge label={t("Sold out")} /> : null}
          {!outOfStock && product.isNew ? <Badge label={t("New")} /> : null}
          {!outOfStock && product.isHot ? <Badge label={t("Hot")} /> : null}
          {!outOfStock && compareNum > price ? <Badge label={t("Sale")} /> : null}
        </div>
        {!outOfStock || product.isPresale ? (
          <div className="absolute bottom-3 right-3 translate-y-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <ProductShareMenu
              productId={product.id}
              productName={productName}
              priceText={priceText}
              imageUrl={image ?? undefined}
              description={product.description ?? ""}
              images={images}
            />
          </div>
        ) : null}
      </div>

      {/* Centered regular-weight info — x.com v-stack gap-1 */}
      <div className="flex flex-col items-center gap-1 pt-5 text-center">
        <h3 className="line-clamp-2 min-h-[41px] text-xs font-normal leading-[20.4px] text-foreground">
          {productName}
        </h3>
        <div className="flex items-baseline justify-center gap-2">
          {product.compareAtPrice != null && toNumberPrice(product.compareAtPrice) > price ? (
            <>
              <span className="text-[15px] font-normal tracking-tight text-foreground">{priceText}</span>
              <span className="text-[13px] text-foreground/50 line-through">{compareText}</span>
            </>
          ) : (
            <span className="text-[15px] font-normal tracking-tight text-foreground">{priceText}</span>
          )}
        </div>
        {colorValues.length > 0 ? (
          <div className="mt-0.5 flex items-center justify-center gap-1.5">
            {colorValues.map((c) => (
              <span
                key={c}
                title={c}
                aria-label={c}
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: colorHex(c) }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

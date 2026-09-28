import Link from "next/link";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { pickName } from "@/lib/shop-i18n";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { listCategoryTree } from "@/server/services/product.service";

/**
 * 集合索引（All collections）—— 上游参考站 `/products` 与 `/collections` **同构渲染**。
 *
 * 原站实测（2026-09-20 Playwright）：两个 URL 都返回 200 且 h1 都是 `All collections`，
 * 并列 4 张正方形集合卡片（Mens · Ox Essentials Collection · Womens · Ox Collection），
 * 卡片链接形如 `/collections/<slug>`。本组件由 `/products` 与 `/collections` 共用，
 * 保证两处逐像素一致。
 *
 * 样式沿用此前 1200 视口逐像素实测的口径：
 *  - 页面底色 `rgb(239,239,239)`（`bg-surface`）
 *  - `<h1>All collections</h1>` 28px 居中
 *  - 3 列正方形卡片、列/行间距 30px，分类名白字叠卡片左下角
 *  - 只渲染**有在售商品**的集合（空集合落地页体验不可接受）
 */
export async function CollectionsIndex() {
  const t = await getT();
  const lang = await getLang();
  const tree = await listCategoryTree();
  const collections = tree.filter((c) => (c.productCount ?? 0) > 0);

  return (
    <div className="flex-1 bg-surface">
      <div className="shell pb-[var(--collection-pb)] pt-[var(--collection-head-pt)]">
        <h1 className="collection-title text-center font-normal text-foreground">
          {t("All collections")}
        </h1>

        {/* 空态（前台体验审计 P0）：collections 已过滤 0 商品集合，空目录时此前只剩 h1 */}
        {collections.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            {t("No collections to browse right now.")}
          </p>
        ) : null}
        <div className="collection-grid mt-[var(--collection-head-gap)]">
          {collections.map((c) => {
            const name = pickName(c.name, c.nameEn ?? null, lang);
            return (
              <Link
                key={c.id}
                href={`/collections/${c.slug}`}
                className="group relative block aspect-square overflow-hidden bg-ink"
              >
                <ImageWithFallback
                  src={c.cardImage || c.image || "/images/demo/banner-ox.jpg"}
                  alt={name}
                  fill
                  // 只有 4 张集合卡：eager 加载（原站同样立即渲染），避免慢卷下
                  // 懒加载未就绪被截进基线造成 9% 像素抖动
                  priority
                  sizes="(max-width: 700px) 50vw, 33vw"
                  className="object-cover ease-out [transition-duration:5000ms] group-hover:scale-[1.06] motion-reduce:transition-none"
                />
                <span className="absolute bottom-[var(--collection-cap-inset-y)] left-[var(--collection-cap-inset-x)] text-[length:var(--collection-cap-size)] font-normal leading-none text-white">
                  {name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

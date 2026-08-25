import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { pickName } from "@/lib/shop-i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = getT();
  return { title: t("All collections") };
}

/**
 * /collections — 全部分类页（shop.x.com /products 同构）：
 * 居中 28px 标题 + 分类卡片网格（图为主、名称居中在下），hover 图片缓慢放大。
 */
export default async function CollectionsPage() {
  const t = getT();
  const lang = getLang();
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  const tops = categories.filter((c) => !c.parentId);

  return (
    <div className="container py-12">
      <h1 className="pb-10 pt-4 text-center text-[28px] font-normal leading-tight text-foreground">
        {t("All collections")}
      </h1>

      <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {tops.map((c) => (
          <Link key={c.id} href={`/products?category=${c.slug}`} className="group block">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-ink">
              <ImageWithFallback
                src={c.image || "/images/xcom/banner-x.jpg"}
                alt={pickName(c.name, c.nameEn ?? null, lang)}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-[5000ms] ease-out group-hover:scale-[1.06]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            </div>
            <div className="pt-4 text-center">
              <p className="text-[15px] font-normal text-foreground">{pickName(c.name, c.nameEn ?? null, lang)}</p>
              <p className="mt-1 text-[13px] opacity-60">
                {c._count.products} {t("items")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

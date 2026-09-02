import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BASE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Commercial SEO: static pages + categories + products */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = ["", "/products"].map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
    priority: path === "" ? 1 : 0.6,
  }));

  try {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      }),
      prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true },
      }),
    ]);

    return [
      ...statics,
      ...categories.map((c) => ({
        url: `${BASE_URL}/products?category=${c.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...products.map((p) => ({
        url: `${BASE_URL}/products/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // DB unavailable at build/runtime — ship statics rather than fail
    return statics;
  }
}

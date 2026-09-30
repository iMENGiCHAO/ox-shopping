import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// 缓存 1 小时（P1-3 商用审计）：此前 force-dynamic 让每次爬虫抓取都全量查库
// （50 万行 seq scan + top-N sort）；商品目录按小时级变化足够，爬虫无感。
export const revalidate = 3600;

const BASE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** sitemap 单文件收录上限（Google 单文件 5 万 URL 硬上限；此处更保守） */
const SITEMAP_MAX_PRODUCTS = 5000;

/** 语言交替链接：无前缀=英文(canonical/x-default)，/zh=中文（P1-1 方案 B） */
function hreflang(url: string) {
  // url 形如 https://site/path 或 https://site/path?query=x —— 取 path 部分拼 /zh 前缀
  const u = new URL(url);
  const zhUrl = `${BASE_URL}/zh${u.pathname === "/" ? "" : u.pathname}${u.search}`;
  return {
    languages: {
      en: url,
      zh: zhUrl,
      "x-default": url,
    },
  };
}

/** Commercial SEO: static pages + categories + products，带 en/zh hreflang 交替链接 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // /products 与 /collections 同为「All collections 索引页」（Phase 13.3 对齐原站），两者都收录
  const statics: MetadataRoute.Sitemap = ["", "/products", "/collections"].map((path) => {
    const url = `${BASE_URL}${path}`;
    return {
      url,
      lastModified: new Date(),
      changeFrequency: path === "" ? ("daily" as const) : ("weekly" as const),
      priority: path === "" ? 1 : 0.6,
      alternates: hreflang(url),
    };
  });

  try {
    const [products, categories, activeProductCount] = await Promise.all([
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: SITEMAP_MAX_PRODUCTS,
      }),
      prisma.category.findMany({
        where: { isActive: true },
        select: { slug: true },
      }),
      prisma.product.count({ where: { status: "ACTIVE" } }),
    ]);

    // 收录截断必须显式（P1-3 商用审计）：此前 take 5000 静默截断，更早商品从
    // 收录里消失且无任何线索。目录增长到超限时告警，提醒切换 generateSitemaps
    // 分片（Next 约定，见 node_modules/next/dist/docs 的 sitemap 文档）。
    if (activeProductCount > SITEMAP_MAX_PRODUCTS) {
      logger.warn(
        { activeProductCount, sitemapLimit: SITEMAP_MAX_PRODUCTS },
        "[sitemap] 商品数超过 sitemap 单文件上限，更早商品未收录 —— 请切换 generateSitemaps 分片",
      );
    }

    return [
      ...statics,
      ...categories.map((c) => {
        // 集合页真实路径是 /collections/<slug>（Phase 13.3 起）；
        // 旧的 /products?category=<slug> 会被 proxy 307 跳转——写进 sitemap
        // 会让搜索引擎全量收录跳转链，必须生成规范 URL。
        const url = `${BASE_URL}/collections/${c.slug}`;
        return {
          url,
          changeFrequency: "weekly" as const,
          priority: 0.7,
          alternates: hreflang(url),
        };
      }),
      ...products.map((p) => {
        const url = `${BASE_URL}/products/${p.slug}`;
        return {
          url,
          lastModified: p.updatedAt,
          changeFrequency: "daily" as const,
          priority: 0.8,
          alternates: hreflang(url),
        };
      }),
    ];
  } catch {
    // DB unavailable at build/runtime — ship statics rather than fail
    return statics;
  }
}

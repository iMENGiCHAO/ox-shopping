import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { cacheGet, cacheSet, productsCacheKey } from "@/lib/cache";
import { createHash } from "crypto";
import { notFound } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** 商品与分类服务(用户端) */

export interface ListProductsParams {
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "title" | "relevance" | "price_asc" | "price_desc" | "sales";
  page: number;
  pageSize: number;
  inStockOnly?: boolean;
  /** 排除指定 slug（官方 /collections/all 未陈列的目录外商品） */
  excludeSlugs?: string[];
}

/**
 * 集合归属条件 —— **「主分类命中」∪「product_collections 成员行」**。
 *
 * 原站 上游参考站 的 collection 与 product_type 是两个概念，且同一件商品可同属多个
 * 集合（实测 `/collections/mens` 里既有签名线的 `Ox Core Tee`，也有基础线的
 * `Ox Graphic Logo Tee`）。`Product.categoryId` 只存一个归属，附加归属落
 * `ProductCollection`，所以列表页 / 集合页 / 计数**都必须走这个并集口径**，
 * 只看 `categoryId` 会漏掉一半商品。
 */
export function collectionMembershipWhere(categoryIds: string[]): Prisma.ProductWhereInput {
  return {
    OR: [
      { categoryId: { in: categoryIds } },
      { collections: { some: { categoryId: { in: categoryIds } } } },
    ],
  };
}

/** 把新条件与既有 `where.AND` 合并（保持可组合，避免覆盖调用方已设的条件） */
function andWhere(
  where: Prisma.ProductWhereInput,
  extra: Prisma.ProductWhereInput,
): Prisma.ProductWhereInput {
  const prev = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  return { ...where, AND: [...prev, extra] };
}

export async function listProducts(params: ListProductsParams) {
  let where: Prisma.ProductWhereInput = { status: "ACTIVE" };

  if (params.search) {
    // 只匹配商品名（name 中文 / nameEn 英文）——对齐 上游参考站 搜索体验：
    // description/sku 命中会把描述里带词的无关商品都搜出来（实测 q=stainless/logo/black）。
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { nameEn: { contains: params.search, mode: "insensitive" } },
    ];
  }

  if (params.categoryId || params.categorySlug) {
    // DB 故障降级：无法解析分类时返回空货架（页面正常渲染），而非整站 500
    let category: Awaited<ReturnType<typeof resolveCategory>>;
    function resolveCategory() {
      return prisma.category.findFirst({
        where: params.categoryId ? { id: params.categoryId } : { slug: params.categorySlug },
        include: { children: true },
      });
    }
    try {
      category = await resolveCategory();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[catalog] 分类解析失败，降级为空列表");
      return { rows: [], total: 0 };
    }
    if (!category) throw notFound("Category not found");
    // 一级分类包含其子分类商品；归属按并集口径（主分类 ∪ 附加集合成员）
    const ids = [category.id, ...category.children.map((c) => c.id)];
    where = andWhere(where, collectionMembershipWhere(ids));
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.price = {
      ...(params.minPrice !== undefined ? { gte: params.minPrice } : {}),
      ...(params.maxPrice !== undefined ? { lte: params.maxPrice } : {}),
    };
  }

  if (params.inStockOnly) where.stock = { gt: 0 };
  if (params.excludeSlugs?.length) where.slug = { notIn: params.excludeSlugs };

  // 稳定排序：所有模式追加 id 决胜键——并列名次（soldCount/price 相同）时若无决胜键，
  // Postgres 重启后返回顺序会漂移，导致列表页/推荐位换品、视觉基线误报
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    params.sort === "price_asc"
      ? [{ price: "asc" }, { id: "asc" }]
      : params.sort === "price_desc"
        ? [{ price: "desc" }, { id: "asc" }]
        : params.sort === "sales"
          ? [{ soldCount: "desc" }, { id: "asc" }]
          : params.sort === "title"
            ? [{ nameEn: "asc" }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "asc" }];

  const cacheKey = productsCacheKey(
    createHash("md5")
      .update(JSON.stringify({ ...params }))
      .digest("hex"),
  );

  const cached = await cacheGet<{ rows: unknown[]; total: number }>(cacheKey);
  if (cached) {
    return {
      rows: cached.rows as Awaited<ReturnType<typeof prisma.product.findMany>>,
      total: cached.total,
    };
  }

  let rows: Awaited<ReturnType<typeof prisma.product.findMany>>;
  let total = 0;
  try {
    [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { category: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.product.count({ where }),
    ]);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[catalog] 商品列表读取失败，降级为空货架");
    return { rows: [], total: 0 };
  }

  // relevance：名称前缀命中排最前，其次子串命中 —— 对齐 Shopify 搜索体验
  if (params.sort === "relevance" && params.search) {
    const q = params.search.toLowerCase();
    type Row = (typeof rows)[number];
    const withName = rows as Row[];
    const score = (r: Row): number => {
      const hay =
        `${(r as { nameEn?: string | null }).nameEn ?? ""} ${(r as { name?: string }).name ?? ""}`.toLowerCase();
      if (hay.startsWith(q)) return 0;
      if (hay.includes(q)) return 1;
      return 2;
    };
    const scored = [...withName].sort((a, b) => score(a) - score(b));
    await cacheSet(cacheKey, { rows: scored, total });
    return { rows: scored, total };
  }

  await cacheSet(cacheKey, { rows, total });

  return { rows, total };
}

/**
 * 商品详情（按 slug）。
 * React cache() = **请求内去重**（交付审计：PDP 的 generateMetadata 与页面 body
 * 此前各查一次库，含 variants 关联；force-dynamic 下每个 PDP 命中都双查询）。
 * 同一次请求内重复调用只打一次库；不同请求互不影响（不是跨请求缓存，无失效问题）。
 */
export const getProductBySlug = cache(async (slug: string) => {
  // DB 故障时同样走 notFound（渲染品牌 404 页），避免错误边界 500
  const product = await prisma.product
    .findUnique({ where: { slug }, include: { category: true, variants: { orderBy: { createdAt: "asc" } } } })
    .catch((err: unknown) => {
      logger.warn({ err: (err as Error).message }, "[catalog] 商品详情读取失败");
      return null;
    });
  if (!product || product.status !== "ACTIVE") throw notFound("Product not found or no longer available");
  return product;
});

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    // SKU 矩阵（组合粒度库存）：后台编辑表单与前台选择器都依赖它
    include: { category: true, variants: { orderBy: { createdAt: "asc" } } },
  });
  if (!product) throw notFound("Product not found");
  return product;
}

export interface CategoryNode {
  id: string;
  name: string;
  nameEn?: string | null;
  slug: string;
  description: string | null;
  image: string | null;
  /** `/collections` 集合卡片图（为空时回落 `image`） */
  cardImage?: string | null;
  /** 落地页顶部全宽大横幅(独立于列表卡片图) */
  bannerImage?: string | null;
  sortOrder: number;
  /** 首页横幅次序（1=左，2=右）；null = 不出现在首页横幅 */
  homeSortOrder?: number | null;
  children: CategoryNode[];
  productCount?: number;
}

/** 分类树(含商品数)，Redis 缓存 */
export async function listCategoryTree(): Promise<CategoryNode[]> {
  const cacheKey = productsCacheKey("categories");
  const cached = await cacheGet<CategoryNode[]>(cacheKey);
  if (cached) return cached;

  // DB 故障降级：分类树是首页/页头的必经渲染路径，读不到时返回空树
  // （页面其余部分照常渲染），而不是让整站 500。
  const categories = await prisma.category
    .findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })
    .catch((err: unknown) => {
      logger.warn({ err: (err as Error).message }, "[catalog] 分类树读取失败，降级为空列表");
      return null;
    });
  if (!categories) return [];

  /* 商品数走**并集口径**（主分类 ∪ 附加集合成员）。
     不能用 `_count.products` —— 它只统计 `categoryId`，会把 Mens / Womens 这类
     靠 `product_collections` 挂载的集合数成 0，导致 /collections 误判为「空集合」。
     用 Set 去重，避免同一商品既命中主分类又有成员行时被数两次。 */
  const [rows, members] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, categoryId: true },
    }),
    prisma.productCollection.findMany({
      where: { product: { status: "ACTIVE" } },
      select: { categoryId: true, productId: true },
    }),
  ]);
  const membersByCategory = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = membersByCategory.get(r.categoryId) ?? new Set<string>();
    set.add(r.id);
    membersByCategory.set(r.categoryId, set);
  }
  for (const m of members) {
    const set = membersByCategory.get(m.categoryId) ?? new Set<string>();
    set.add(m.productId);
    membersByCategory.set(m.categoryId, set);
  }

  const byParent = new Map<string | null, CategoryNode[]>();
  for (const c of categories) {
    const node: CategoryNode = {
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      slug: c.slug,
      description: c.description,
      image: c.image,
      cardImage: c.cardImage,
      bannerImage: c.bannerImage,
      sortOrder: c.sortOrder,
      homeSortOrder: c.homeSortOrder,
      children: [],
      productCount: membersByCategory.get(c.id)?.size ?? 0,
    };
    const list = byParent.get(c.parentId ?? null) ?? [];
    list.push(node);
    byParent.set(c.parentId ?? null, list);
  }

  const tree = (byParent.get(null) ?? []).map((node) => ({
    ...node,
    children: byParent.get(node.id) ?? [],
  }));

  await cacheSet(cacheKey, tree, 300);
  return tree;
}

export async function getRelatedProducts(productId: string, categoryId: string, limit = 4) {
  return prisma.product.findMany({
    where: { categoryId, status: "ACTIVE", id: { not: productId } },
    // id 决胜键保证并列 soldCount 时推荐位稳定（重启不漂移）
    orderBy: [{ soldCount: "desc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      soldCount: true,
      stock: true,
    },
  });
}

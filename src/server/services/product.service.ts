import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, productsCacheKey } from "@/lib/cache";
import { createHash } from "crypto";
import { ApiError, badRequest, notFound } from "@/lib/errors";

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

export async function listProducts(params: ListProductsParams) {
  const where: Prisma.ProductWhereInput = { status: "ACTIVE" };

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
      { sku: { contains: params.search, mode: "insensitive" } },
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
      console.error("[catalog] 分类解析失败，降级为空列表:", (err as Error).message);
      return { rows: [], total: 0 };
    }
    if (!category) throw notFound("分类不存在");
    // 一级分类包含其子分类商品
    const ids = [category.id, ...category.children.map((c) => c.id)];
    where.categoryId = { in: ids };
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.price = {
      ...(params.minPrice !== undefined ? { gte: params.minPrice } : {}),
      ...(params.maxPrice !== undefined ? { lte: params.maxPrice } : {}),
    };
  }

  if (params.inStockOnly) where.stock = { gt: 0 };
  if (params.excludeSlugs?.length) where.slug = { notIn: params.excludeSlugs };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    params.sort === "price_asc"
      ? { price: "asc" }
      : params.sort === "price_desc"
        ? { price: "desc" }
        : params.sort === "sales"
          ? { soldCount: "desc" }
          : params.sort === "title"
            ? { nameEn: "asc" }
            : { createdAt: "desc" };

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
    console.error("[catalog] 商品列表读取失败，降级为空货架:", (err as Error).message);
    return { rows: [], total: 0 };
  }

  // relevance：名称命中排前（组内保持官方顺序），其余在后 —— 对齐 Shopify 搜索体验
  if (params.sort === "relevance" && params.search) {
    const q = params.search.toLowerCase();
    type Row = (typeof rows)[number];
    const withName = rows as Row[];
    const scored = [...withName].sort((a, b) => {
      const aHit = `${(a as { nameEn?: string | null }).nameEn ?? ""} ${(a as { name?: string }).name ?? ""}`
        .toLowerCase()
        .includes(q);
      const bHit = `${(b as { nameEn?: string | null }).nameEn ?? ""} ${(b as { name?: string }).name ?? ""}`
        .toLowerCase()
        .includes(q);
      return aHit === bHit ? 0 : aHit ? -1 : 1;
    });
    await cacheSet(cacheKey, { rows: scored, total });
    return { rows: scored, total };
  }

  await cacheSet(cacheKey, { rows, total });

  return { rows, total };
}

export async function getProductBySlug(slug: string) {
  // DB 故障时同样走 notFound（渲染品牌 404 页），避免错误边界 500
  const product = await prisma.product
    .findUnique({ where: { slug }, include: { category: true } })
    .catch((err: unknown) => {
      console.error("[catalog] 商品详情读取失败:", (err as Error).message);
      return null;
    });
  if (!product || product.status !== "ACTIVE") throw notFound("商品不存在或已下架");
  return product;
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!product) throw notFound("商品不存在");
  return product;
}

export interface CategoryNode {
  id: string;
  name: string;
  nameEn?: string | null;
  slug: string;
  description: string | null;
  image: string | null;
  /** 落地页顶部全宽大横幅(独立于列表卡片图) */
  bannerImage?: string | null;
  sortOrder: number;
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
      include: { _count: { select: { products: { where: { status: "ACTIVE" } } } } },
    })
    .catch((err: unknown) => {
      console.error("[catalog] 分类树读取失败，降级为空列表:", (err as Error).message);
      return null;
    });
  if (!categories) return [];

  const byParent = new Map<string | null, CategoryNode[]>();
  for (const c of categories) {
    const node: CategoryNode = {
      id: c.id,
      name: c.name,
      nameEn: c.nameEn,
      slug: c.slug,
      description: c.description,
      image: c.image,
      bannerImage: c.bannerImage,
      sortOrder: c.sortOrder,
      children: [],
      productCount: c._count.products,
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

/** 获取分类(供筛选器) */
export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category
    .findUnique({ where: { slug }, include: { children: true } })
    .catch((err: unknown) => {
      console.error("[catalog] 分类详情读取失败:", (err as Error).message);
      return null;
    });
  if (!category || !category.isActive) throw notFound("分类不存在");
  return category;
}

/** 评分统计与Reviews列表 */

export async function getRatingStats(productId: string) {
  const grouped = await prisma.review.groupBy({
    by: ["rating"],
    where: { productId, isHidden: false },
    _count: { _all: true },
  });
  const distribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: grouped.find((g) => g.rating === rating)?._count._all ?? 0,
  }));
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const avg = total === 0 ? 0 : distribution.reduce((s, d) => s + d.rating * d.count, 0) / total;
  return {
    average: Math.round(avg * 10) / 10,
    total,
    distribution,
  };
}

export async function listReviews(
  productId: string,
  opts: { page: number; pageSize: number; rating?: number },
) {
  const where: Prisma.ReviewWhereInput = { productId, isHidden: false };
  if (opts.rating) where.rating = opts.rating;
  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        images: true,
        isVerifiedPurchase: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.review.count({ where }),
  ]);
  return { rows, total };
}

export async function getRelatedProducts(productId: string, categoryId: string, limit = 4) {
  return prisma.product.findMany({
    where: { categoryId, status: "ACTIVE", id: { not: productId } },
    orderBy: { soldCount: "desc" },
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

/** 首页数据 */
export async function getHomeData() {
  const [hot, newest] = await Promise.all([
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { soldCount: "desc" },
      take: 8,
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
        category: { select: { name: true } },
      },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 8,
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
    }),
  ]);
  return { hot, newest };
}

/** 有效Discount券(首页/Shopping Bag展示) */
export async function listActiveCoupons() {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { createdAt: "desc" },
  });
  // 跨列比较(usedCount < usageLimit)在内存中过滤；Discount券数量有限，性能无影响
  return coupons.filter((c) => c.usageLimit === 0 || c.usedCount < c.usageLimit).slice(0, 6);
}

export function requireProduct(result: unknown): asserts result is NonNullable<typeof result> {
  if (!result) throw new ApiError(404, "NOT_FOUND", "商品不存在");
}

export { badRequest };

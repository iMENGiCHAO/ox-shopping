import { apiHandler, jsonPaginated, searchParam } from "@/lib/api";
import { listProducts } from "@/server/services/product.service";
import { serializeProduct } from "@/server/serializers";
import { parsePagination } from "@/lib/utils";

export const runtime = "nodejs";

function parseNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

/** GET /api/products — 商品列表 */
export const GET = apiHandler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const q = searchParam(sp, "q");
  const category = searchParam(sp, "category");
  const minPrice = searchParam(sp, "minPrice");
  const maxPrice = searchParam(sp, "maxPrice");
  const sort = searchParam(sp, "sort");
  const inStock = searchParam(sp, "inStock");
  const { page, pageSize } = parsePagination(sp);

  const sortValue =
    sort === "newest" || sort === "price_asc" || sort === "price_desc" || sort === "sales"
      ? sort
      : undefined;

  const { rows, total } = await listProducts({
    search: q,
    categorySlug: category,
    minPrice: parseNum(minPrice),
    maxPrice: parseNum(maxPrice),
    sort: sortValue,
    page,
    pageSize,
    inStockOnly: inStock === "true",
  });

  return jsonPaginated(rows.map(serializeProduct), {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

import { apiHandler, json } from "@/lib/api";
import { routeParam } from "@/app/api/_lib/params";
import { listProductReviews } from "@/server/services/review.service";

/** 商品公开评价（仅 APPROVED，分页；游客可看，登录才可写）。
 * 路由段沿用同层既有的 [id] 命名（Next 限制：同一层级动态段名必须一致）；
 * 参数兼容 slug 与数据库 id（服务层 OR 查询）。 */
export const GET = apiHandler(async (req, ctx) => {
  const slugOrId = routeParam(ctx.params.id);
  const { searchParams } = new URL(req.url);
  const data = await listProductReviews(slugOrId, searchParams);
  return json(data);
});

import { apiHandler, json } from "@/lib/api";
import { routeParam } from "@/app/api/_lib/params";
import { listProductReviews } from "@/server/services/review.service";

/** 商品公开评价（仅 APPROVED，分页；游客可看，登录才可写） */
export const GET = apiHandler(async (req, ctx) => {
  const slug = routeParam(ctx.params.slug);
  const { searchParams } = new URL(req.url);
  const data = await listProductReviews(slug, searchParams);
  return json(data);
});

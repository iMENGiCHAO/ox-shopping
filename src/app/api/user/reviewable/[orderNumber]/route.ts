import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { routeParam } from "@/app/api/_lib/params";
import { listReviewableItems } from "@/server/services/review.service";

/** 某订单可评价的行（订单详情「写评价」入口数据源） */
export const GET = apiHandler(async (_req, ctx) => {
  const user = await requireUser();
  const orderNumber = routeParam(ctx.params.orderNumber);
  const data = await listReviewableItems(user.id, orderNumber);
  return json(data);
});

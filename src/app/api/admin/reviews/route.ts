import { apiHandler, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { adminListReviews } from "@/server/services/review.service";

/** admin：评价列表（含已下架；status/q 过滤） */
export const GET = apiHandler(async (req) => {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const data = await adminListReviews(searchParams);
  return json(data);
});

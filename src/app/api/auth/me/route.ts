import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/** GET /api/auth/me — 当前登录用户 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  return json({ user });
});

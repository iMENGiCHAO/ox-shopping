import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getIdentity } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * GET /api/distribution/my/links — 我的推广链接 / 二维码内容 / 邀请码。
 *
 * 「人人有推广链接」：任何注册用户（无论是否已升级为分销商）都能拿到自己的链接；
 * 推广码在首次访问时惰性生成并落库（老用户无需数据迁移）。
 */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  const user = await requireUser();
  const identity = await getIdentity(user.id, env.SITE_URL);
  return json({ identity });
});

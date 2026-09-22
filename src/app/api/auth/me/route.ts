import { apiHandler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { unauthorized } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/auth/me — 当前登录用户（含注销申请状态，profile 页展示用）
 *
 * 刻意不走 `requireUser()`：强制改密（`mustChangePassword`）期间客户端仍需
 * 能读到自己的会话（顶栏/改密页要显示当前账号），否则页面会误判为未登录。
 * 接口本身只回读、不改写，放行不构成越权。
 */
export const GET = apiHandler(async () => {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  // 会话字段只含安全集；注销申请状态单独补查（有值=申请处理中）
  const extra = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deletionRequestedAt: true },
  });
  return json({ user: { ...user, deletionRequestedAt: extra?.deletionRequestedAt ?? null } });
});

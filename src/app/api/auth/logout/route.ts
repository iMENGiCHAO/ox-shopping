import { apiHandler, json } from "@/lib/api";
import {
  clearAuthCookies,
  clearPasswordChangeRequiredCookie,
  requireUserAllowingPendingPasswordChange,
  revokeAllUserTokens,
} from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * POST /api/auth/logout
 *
 * 用 `requireUserAllowingPendingPasswordChange` 而非 `requireUser`：
 * 被强制改密的用户必须能退出登录（否则只能改密，等于把人钉死在这个账号上）。
 */
export const POST = apiHandler(async (req) => {
  const user = await requireUserAllowingPendingPasswordChange();
  await revokeAllUserTokens(user.id);

  const res = json({ ok: true });
  clearAuthCookies(res);
  clearPasswordChangeRequiredCookie(res);

  await audit({ userId: user.id, action: "AUTH_LOGOUT", entity: "User", entityId: user.id, req });
  return res;
});

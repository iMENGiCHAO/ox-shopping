import { apiHandler, json } from "@/lib/api";
import { clearAuthCookies, requireUser, revokeAllUserTokens } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** POST /api/auth/logout */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  await revokeAllUserTokens(user.id);

  const res = json({ ok: true });
  clearAuthCookies(res);

  await audit({ userId: user.id, action: "AUTH_LOGOUT", entity: "User", entityId: user.id, req });
  return res;
});

import { apiHandler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** GET /api/auth/me — 当前登录用户（含注销申请状态，profile 页展示用） */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  // requireUser 只带会话安全字段；注销申请状态单独补查（有值=申请处理中）
  const extra = await prisma.user.findUnique({
    where: { id: user.id },
    select: { deletionRequestedAt: true },
  });
  return json({ user: { ...user, deletionRequestedAt: extra?.deletionRequestedAt ?? null } });
});

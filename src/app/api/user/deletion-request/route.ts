import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { dataDeletionSchema } from "@/lib/validations/admin";

export const runtime = "nodejs";

/** POST /api/user/deletion-request — 数据删除请求 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, dataDeletionSchema);

  await audit({
    userId: user.id,
    action: "DATA_DELETION_REQUEST",
    entity: "User",
    entityId: user.id,
    meta: { reason: input.reason ?? "" },
    req,
  });
  await sendMail({ to: user.email, template: "data-deletion", data: { name: user.name } });

  return json({ ok: true });
});

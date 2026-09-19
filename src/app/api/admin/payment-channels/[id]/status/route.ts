import { z } from "zod";
import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { listAdminChannels, setChannelEnabled } from "@/lib/payment/channel.service";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

const statusSchema = z.object({ enabled: z.boolean() });

/** PATCH /api/admin/payment-channels/[id]/status — 启用 / 禁用 */
export const PATCH = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const { enabled } = await readJson(req, statusSchema);

  await setChannelEnabled(id, enabled);

  await audit({
    userId: actor.id,
    action: enabled ? "PAYMENT_CHANNEL_ENABLE" : "PAYMENT_CHANNEL_DISABLE",
    entity: "PaymentChannel",
    entityId: id,
    req,
  });

  return json({ channels: await listAdminChannels() });
});
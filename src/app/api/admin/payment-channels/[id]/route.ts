import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { listAdminChannels, upsertChannel } from "@/lib/payment/channel.service";
import {
  paymentChannelSchema,
  validateChannelConfig,
} from "@/lib/validations/payment-channel";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PUT /api/admin/payment-channels/[id] — 编辑渠道；secret 字段空值/掩码 = 保留原值 */
export const PUT = apiHandler(async (req, ctx) => {
  const actor = await requireAdmin();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, paymentChannelSchema);

  const errs = validateChannelConfig(input.provider, input.config);
  if (errs.length > 0) throw badRequest(errs.join("；"));

  const channel = await upsertChannel({
    id,
    code: input.code,
    name: input.name,
    provider: input.provider,
    enabled: input.enabled,
    sortOrder: input.sortOrder,
    config: input.config,
  });

  await audit({
    userId: actor.id,
    action: "PAYMENT_CHANNEL_UPDATE",
    entity: "PaymentChannel",
    entityId: id,
    meta: { code: channel.code, provider: channel.provider },
    req,
  });

  return json({ channels: await listAdminChannels() });
});
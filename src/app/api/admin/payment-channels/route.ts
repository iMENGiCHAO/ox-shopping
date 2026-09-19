import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { listAdminChannels, upsertChannel } from "@/lib/payment/channel.service";
import {
  paymentChannelSchema,
  validateChannelConfig,
} from "@/lib/validations/payment-channel";
import { CHANNEL_META } from "@/lib/payment/providers";

export const runtime = "nodejs";

/** GET /api/admin/payment-channels — 渠道列表（config 脱敏）+ 内置渠道定义 */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const channels = await listAdminChannels();
  return json({ channels, meta: CHANNEL_META });
});

/** POST /api/admin/payment-channels — 新增渠道（config 校验后加密落库） */
export const POST = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, paymentChannelSchema);

  const errs = validateChannelConfig(input.provider, input.config);
  if (errs.length > 0) throw badRequest(errs.join("；"));

  const channel = await upsertChannel({
    code: input.code,
    name: input.name,
    provider: input.provider,
    enabled: input.enabled,
    sortOrder: input.sortOrder,
    config: input.config,
  });

  await audit({
    userId: actor.id,
    action: "PAYMENT_CHANNEL_CREATE",
    entity: "PaymentChannel",
    entityId: channel.id,
    meta: { code: channel.code, provider: channel.provider },
    req,
  });

  return json({ channels: await listAdminChannels() });
});
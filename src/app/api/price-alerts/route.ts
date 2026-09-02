import { NextRequest } from "next/server";
import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listForUser, resubscribe, unsubscribe } from "@/server/services/price-alert.service";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * GET /api/price-alerts
 * 列出当前用户已收藏商品的降价通知状态（含取消订阅的，用于管理）
 */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const list = await listForUser(user.id);
  return json({ alerts: list });
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["unsubscribe", "resubscribe"]),
});

/**
 * PATCH /api/price-alerts — 切换通知状态（不删除收藏）
 *  body: { id, action: "unsubscribe" | "resubscribe" }
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await readJson(req, actionSchema);
  const ok =
    body.action === "unsubscribe"
      ? await unsubscribe(body.id, user.id)
      : await resubscribe(body.id, user.id);
  return json({ ok });
});

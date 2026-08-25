import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { siteSettingsSchema } from "@/lib/validations/admin";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** GET /api/admin/settings — 全部站点设置 */
export const GET = apiHandler(async () => {
  await requireStaff();
  const rows = await prisma.siteSetting.findMany();
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  return json({ settings });
});

/** PUT /api/admin/settings — 批量更新(upsert) */
export const PUT = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, siteSettingsSchema);

  for (const [key, value] of Object.entries(input)) {
    const jsonValue = value as Prisma.InputJsonValue;
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue },
    });
  }

  await audit({
    userId: actor.id,
    action: "SETTINGS_UPDATE",
    entity: "SiteSetting",
    meta: { keys: Object.keys(input) },
    req,
  });
  return json({ settings: input });
});

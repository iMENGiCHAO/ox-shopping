import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { siteSettingsSchema } from "@/lib/validations/admin";
import { isLogoArtworkDark } from "@/lib/logo-contrast";
import { invalidateSettingsCache } from "@/server/services/settings.service";
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

  // LOGO 更新时同步测定图案明度：黑色顶栏上深色图案需自动反白。
  // 测定失败（返回 null）时删除标记，视为"不反白"的保守默认。
  if ("siteLogoUrl" in input) {
    const url = typeof input.siteLogoUrl === "string" ? input.siteLogoUrl : null;
    const dark = url ? await isLogoArtworkDark(url) : false;
    if (dark === null) {
      await prisma.siteSetting.deleteMany({ where: { key: "siteLogoDarkArtwork" } });
    } else {
      await prisma.siteSetting.upsert({
        where: { key: "siteLogoDarkArtwork" },
        update: { value: dark },
        create: { key: "siteLogoDarkArtwork", value: dark },
      });
    }
  }

  // 使前端 getSiteSettings() 缓存立即失效，改动近实时直达前台
  await invalidateSettingsCache();

  await audit({
    userId: actor.id,
    action: "SETTINGS_UPDATE",
    entity: "SiteSetting",
    meta: { keys: Object.keys(input) },
    req,
  });
  return json({ settings: input });
});

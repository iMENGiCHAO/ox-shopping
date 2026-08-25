import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin, requireStaff } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPageBanners, parsePageBanners, PAGE_BANNERS_KEY } from "@/server/services/settings.service";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

const slotSchema = z.object({
  image: z.string().max(1000).refine((v) => v === "" || /^https?:\/\//.test(v) || v.startsWith("/"), "Invalid image URL"),
  href: z.string().max(500).refine((v) => v === "" || /^https?:\/\//.test(v) || v.startsWith("/"), "Invalid href"),
  title: z.string().max(80),
});

const schema = z.object({
  homeLeft: slotSchema,
  homeRight: slotSchema,
});

/** GET /api/admin/banners — 页面横幅配置 */
export const GET = apiHandler(async () => {
  await requireStaff();
  return json({ data: await getPageBanners() });
});

/** PUT /api/admin/banners — 保存页面横幅配置 */
export const PUT = apiHandler(async (req: Request) => {
  const actor = await requireAdmin();
  const input = await readJson(req, schema);
  const jsonValue = input as unknown as Prisma.InputJsonValue;
  await prisma.siteSetting.upsert({
    where: { key: PAGE_BANNERS_KEY },
    update: { value: jsonValue },
    create: { key: PAGE_BANNERS_KEY, value: jsonValue },
  });
  await audit({ userId: actor.id, action: "SETTINGS_UPDATE", entity: "SiteSetting", meta: { keys: [PAGE_BANNERS_KEY] }, req });
  return json({ data: parsePageBanners(input) });
});

import { apiHandler, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";
import { invalidateSettingsCache } from "@/server/services/settings.service";
import { z } from "zod";

export const runtime = "nodejs";

const KEY = "contact_content";

const schema = z.object({
  heading: z.string().trim().max(60).default("Contact us"),
  body: z.string().trim().max(2000).default(""),
  email: z.string().trim().email().or(z.literal("")).default(""),
});

const DEFAULTS = { heading: "Contact us", body: "", email: "" };

/** GET /api/admin/contact-content */
export const GET = apiHandler(async () => {
  await requireStaff();
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  return json({ data: (row?.value as object) ?? DEFAULTS });
});

/** PUT /api/admin/contact-content */
export const PUT = apiHandler(async (req) => {
  await requireStaff();
  const input = await readJson(req, schema);
  const value = { ...DEFAULTS, ...input };
  await prisma.siteSetting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  });
  await invalidateSettingsCache();
  return json({ data: value });
});

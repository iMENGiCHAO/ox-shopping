import { z } from "zod";
import { apiHandler, json, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { GATEWAYS } from "@/lib/payment-gateways";

export const runtime = "nodejs";

const DB_KEY = "payment.gateways";

type GatewayConfig = Record<string, unknown>;
type GatewayMap = Record<string, GatewayConfig>;

/** 需要脱敏的字段集合 */
const SECRET_KEYS = new Set(
  GATEWAYS.flatMap((g) => g.fields.filter((f) => f.secret).map((f) => f.key)),
);

function mask(v: string): string {
  return v ? `••••${v.slice(-4)}` : "";
}

async function readGateways(): Promise<GatewayMap> {
  const row = await prisma.siteSetting.findUnique({ where: { key: DB_KEY } });
  const v = row?.value;
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as GatewayMap;
}

/** GET /api/admin/payment-settings — 网关定义 + 已存配置(密钥字段脱敏) */
export const GET = apiHandler(async () => {
  await requireAdmin();
  const stored = await readGateways();
  // 脱敏输出
  const safe: GatewayMap = {};
  for (const g of GATEWAYS) {
    const cfg = (stored[g.key] ?? {}) as GatewayConfig;
    const out: GatewayConfig = { enabled: cfg.enabled === true };
    for (const f of g.fields) {
      out[f.key] = f.secret ? mask(String(cfg[f.key] ?? "")) : String(cfg[f.key] ?? "");
    }
    safe[g.key] = out;
  }
  return json({
    gateways: GATEWAYS,
    config: safe,
    /** 当前结算模式:mock = 预留未接入 */
    mode: "mock" as const,
  });
});

const putSchema = z.object({
  config: z.record(
    z.string(),
    z.object({ enabled: z.boolean() }).catchall(z.union([z.string(), z.boolean()])),
  ),
});

/** PUT /api/admin/payment-settings — 保存配置(空串/掩码=保留原值,不覆盖密钥) */
export const PUT = apiHandler(async (req) => {
  const actor = await requireAdmin();
  const input = await readJson(req, putSchema);
  const stored = await readGateways();

  const next: GatewayMap = {};
  for (const g of GATEWAYS) {
    const prev = stored[g.key] ?? { enabled: false };
    const inc = input.config[g.key];
    const out: GatewayConfig = { enabled: inc?.enabled === true };
    for (const f of g.fields) {
      const incoming = String((inc as Record<string, unknown> | undefined)?.[f.key] ?? "");
      const oldVal = String(prev[f.key] ?? "");
      if (f.secret) {
        // 密钥字段:空串或掩码 → 保留旧值
        out[f.key] = incoming === "" || incoming.startsWith("••••") ? oldVal : incoming;
      } else {
        out[f.key] = incoming;
      }
    }
    next[g.key] = out;
  }

  const jsonSafe = JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue;
  await prisma.siteSetting.upsert({
    where: { key: DB_KEY },
    update: { value: jsonSafe },
    create: { key: DB_KEY, value: jsonSafe },
  });

  await audit({
    userId: actor.id,
    action: "PAYMENT_SETTINGS_UPDATE",
    entity: "SiteSetting",
    entityId: DB_KEY,
    meta: { gateways: Object.keys(next) },
    req,
  });

  // 返回脱敏后的最新配置
  const safe: GatewayMap = {};
  for (const g of GATEWAYS) {
    const cfg = next[g.key] ?? { enabled: false };
    const out: GatewayConfig = { enabled: cfg.enabled === true };
    for (const f of g.fields) {
      out[f.key] = f.secret ? mask(String(cfg[f.key] ?? "")) : String(cfg[f.key] ?? "");
    }
    safe[g.key] = out;
  }
  return json({ config: safe, mode: "mock" as const });
});

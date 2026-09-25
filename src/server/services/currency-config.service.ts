import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { CURRENCIES } from "@/components/shop/currency";

/**
 * 币种配置服务 —— 支持币种的后台可管理化（2026-09-24 大爷需求）。
 *
 * 为什么落库而不是继续用前端硬编码的 CURRENCIES：
 *   · 运营要能**增删**站点支持的币种（例如面向东南亚时加 THB）；
 *   · 「展示换算」与「可用于支付」解耦（enabled/payable 两级开关）——
 *     例如展示 CNY 换算但结账只收 USD；
 *   · 前端 CURRENCIES 保留为**内置兜底清单**：表空/故障时前台不白屏。
 *
 * 播种口径：首次读取时把内置清单幂等播种进表（此后以表为准，后台可自由改）。
 */

export interface CurrencyConfigDTO {
  id: string;
  code: string;
  name: string;
  country: string;
  symbol: string;
  locale: string;
  flagCode: string;
  enabled: boolean;
  payable: boolean;
  sortOrder: number;
}

/** 表空时播种内置清单（幂等；此后一切以 DB 为准） */
async function ensureSeeded(): Promise<void> {
  const count = await prisma.currencyConfig.count();
  if (count > 0) return;
  await prisma.currencyConfig.createMany({
    data: CURRENCIES.map((c, i) => ({
      code: c.code,
      name: c.name,
      country: c.country,
      symbol: c.symbol,
      locale: c.locale,
      flagCode: c.flagCode,
      enabled: true,
      payable: true,
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
  logger.info({ count: CURRENCIES.length }, "货币配置：已播种内置币种清单");
}

/** 前台币种选择器数据源（enabled 列表；表故障时回退内置清单） */
export async function listEnabledCurrencies(): Promise<CurrencyConfigDTO[]> {
  try {
    await ensureSeeded();
    const rows = await prisma.currencyConfig.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    if (rows.length === 0) return builtinFallback();
    return rows.map(toDTO);
  } catch (err) {
    logger.warn({ err }, "货币配置读取失败，前台回退内置清单");
    return builtinFallback();
  }
}

/** 可支付币种集合（下单校验用）。表故障时视为「全部可支付」——不能因配置故障卖不出货 */
export async function payableCurrencyCodes(): Promise<Set<string> | null> {
  try {
    await ensureSeeded();
    const rows = await prisma.currencyConfig.findMany({
      where: { payable: true },
      select: { code: true },
    });
    if (rows.length === 0) return null;
    return new Set(rows.map((r) => r.code.toUpperCase()));
  } catch (err) {
    logger.warn({ err }, "货币配置读取失败，跳过支付币种校验");
    return null;
  }
}

/** 后台管理列表（全部，含 enabled=false 的） */
export async function listAdminCurrencies(): Promise<CurrencyConfigDTO[]> {
  await ensureSeeded();
  const rows = await prisma.currencyConfig.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map(toDTO);
}

export interface CurrencyUpsertInput {
  code: string;
  name: string;
  country: string;
  symbol: string;
  locale: string;
  flagCode: string;
  enabled?: boolean;
  payable?: boolean;
  sortOrder?: number;
}

/** 新增/更新币种（按 code upsert；code 统一大写） */
export async function upsertCurrency(input: CurrencyUpsertInput): Promise<CurrencyConfigDTO> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("币种代码必须是 3 位大写字母（ISO 4217）");
  const data: Prisma.CurrencyConfigUncheckedCreateInput = {
    code,
    name: input.name.trim() || code,
    country: input.country.trim() || "—",
    symbol: input.symbol.trim() || code,
    locale: input.locale.trim() || "en-US",
    flagCode: input.flagCode.trim().toLowerCase() || "us",
    enabled: input.enabled ?? true,
    payable: input.payable ?? true,
    sortOrder: input.sortOrder ?? 100,
  };
  const row = await prisma.currencyConfig.upsert({
    where: { code },
    create: data,
    update: {
      name: data.name,
      country: data.country,
      symbol: data.symbol,
      locale: data.locale,
      flagCode: data.flagCode,
      enabled: data.enabled ?? undefined,
      payable: input.payable ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
    },
  });
  return toDTO(row);
}

/** 删除币种（code 查无时静默 —— 幂等） */
export async function deleteCurrency(code: string): Promise<void> {
  await prisma.currencyConfig.deleteMany({ where: { code: code.toUpperCase() } });
}

function toDTO(row: {
  id: string;
  code: string;
  name: string;
  country: string;
  symbol: string;
  locale: string;
  flagCode: string;
  enabled: boolean;
  payable: boolean;
  sortOrder: number;
}): CurrencyConfigDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    country: row.country,
    symbol: row.symbol,
    locale: row.locale,
    flagCode: row.flagCode,
    enabled: row.enabled,
    payable: row.payable,
    sortOrder: row.sortOrder,
  };
}

/** 内置兜底（与前台 CURRENCIES 同构，标记 enabled/payable 全开） */
function builtinFallback(): CurrencyConfigDTO[] {
  return CURRENCIES.map((c, i) => ({
    id: `builtin-${c.code}`,
    code: c.code,
    name: c.name,
    country: c.country,
    symbol: c.symbol,
    locale: c.locale,
    flagCode: c.flagCode,
    enabled: true,
    payable: true,
    sortOrder: i,
  }));
}

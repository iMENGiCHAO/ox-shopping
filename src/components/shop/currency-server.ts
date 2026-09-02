import "server-only";
import dns from "node:dns";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/monitoring";
import {
  convertPrice,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  FALLBACK_RATES,
  formatAmount,
  getCurrencyDef,
  parseCurrencyCode,
} from "@/components/shop/currency";

/**
 * 服务端汇率模块。
 * 数据源优先级：内存缓存(6h 新鲜) → open.er-api.com 实时接口
 *   → 数据库「最后已知好汇率」→ 内置静态参考表(最终兜底)。
 *
 * 商用考量：
 * - 成功拉取的汇率持久化入库：重启/断网都不会跳回写死的失真值；
 * - 单飞(single-flight)：并发请求只发一次上游调用；
 * - SWR：缓存过期先返回旧值，后台静默刷新，用户永不等待上游。
 */

const RATE_API = "https://open.er-api.com/v6/latest/USD";
const FRESH_TTL_MS = 6 * 60 * 60 * 1000; // 上游免费源每日更新，6h 足够新鲜
const FETCH_TIMEOUT_MS = 5000;

// Node ≥17 默认 IPv6 优先，在仅有 IPv4 出口的机器(macOS/部分容器)上会连不上汇率源；
// 仅影响本进程的 DNS 解析顺序。
dns.setDefaultResultOrder("ipv4first");
const DB_KEY_RATES = "fx.rates";
const DB_KEY_RATES_AT = "fx.ratesAt";
/** 管理端手动覆写:{ CNY: 7.25 } —— 优先于自动汇率;null/删除键=恢复自动 */
const DB_KEY_OVERRIDES = "fx.overrides";

export interface RateSnapshot {
  rates: Record<string, number>;
  /** 本份汇率的产生时间(ms) */
  at: number;
  /** live=实时接口 / db=库内最后已知 / static=内置参考表 */
  source: "live" | "db" | "static";
}

let cache: RateSnapshot | null = null;
let inflight: Promise<RateSnapshot> | null = null;

async function fetchLiveRates(): Promise<Record<string, number> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(RATE_API, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result === "success" && data.rates && typeof data.rates === "object") {
      // 以实时数据为主，静态表兜底缺失币种
      return { ...FALLBACK_RATES, ...data.rates };
    }
    return null;
  } catch {
    return null;
  }
}

async function persistRates(rates: Record<string, number>, at: number): Promise<void> {
  try {
    await prisma.siteSetting.upsert({
      where: { key: DB_KEY_RATES },
      update: { value: rates },
      create: { key: DB_KEY_RATES, value: rates },
    });
    await prisma.siteSetting.upsert({
      where: { key: DB_KEY_RATES_AT },
      update: { value: at },
      create: { key: DB_KEY_RATES_AT, value: at },
    });
  } catch (err) {
    logger.warn({ err }, "[fx] 汇率持久化失败(不影响本次使用)");
  }
}

async function loadPersistedRates(): Promise<RateSnapshot | null> {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [DB_KEY_RATES, DB_KEY_RATES_AT] } },
    });
    const ratesRow = rows.find((r) => r.key === DB_KEY_RATES);
    if (!ratesRow || !ratesRow.value || typeof ratesRow.value !== "object") return null;
    const atRow = rows.find((r) => r.key === DB_KEY_RATES_AT);
    const at = typeof atRow?.value === "number" ? atRow.value : Date.now();
    return {
      rates: { ...FALLBACK_RATES, ...(ratesRow.value as Record<string, number>) },
      at,
      source: "db",
    };
  } catch {
    return null;
  }
}

/** 拉取并落库一次；返回最新快照 */
async function refresh(): Promise<RateSnapshot> {
  const overrides = await loadOverrides();
  const applyOv = (r: Record<string, number>) => ({ ...r, ...overrides });

  const live = await fetchLiveRates();
  if (live) {
    const rates = applyOv(live);
    const snap: RateSnapshot = { rates, at: Date.now(), source: "live" };
    cache = snap;
    void persistRates(live, snap.at);
    return snap;
  }
  const persisted = await loadPersistedRates();
  if (persisted) {
    const ageH = Math.round(((Date.now() - persisted.at) / 3_600_000) * 10) / 10;
    logger.warn({ ageHours: ageH }, "[fx] 实时汇率不可用，回退库内最后已知汇率");
    captureMessage(`[fx] 实时汇率不可用，已回退库内汇率(滞后 ${ageH}h)`, "warning");
    cache = persisted;
    return persisted;
  }
  logger.warn("[fx] 实时与库内汇率均不可用，使用内置参考汇率(请检查外网连通性)");
  captureMessage("[fx] 汇率已退化为内置参考值，展示价格可能失真", "error");
  cache = { rates: applyOv(FALLBACK_RATES), at: Date.now(), source: "static" };
  return cache;
}

/** 读取管理端手动覆写(无则空对象) */
export async function loadOverrides(): Promise<Record<string, number>> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: DB_KEY_OVERRIDES } });
    const v = row?.value;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      const num = Number(n);
      if (Number.isFinite(num) && num > 0) out[k] = num;
    }
    return out;
  } catch {
    return {};
  }
}

/** 保存管理端覆写(整表替换);传 {} 清空全部覆写 */
export async function saveOverrides(map: Record<string, number>): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: DB_KEY_OVERRIDES },
    update: { value: map },
    create: { key: DB_KEY_OVERRIDES, value: map },
  });
  invalidateRateCache();
}

/** 丢弃内存缓存(下次读取强制走 refresh 链路) */
export function invalidateRateCache(): void {
  cache = null;
  inflight = null;
}

/** 管理端"立即刷新":绕过缓存直接拉上游并落库 */
export async function forceRefreshRates(): Promise<RateSnapshot> {
  invalidateRateCache();
  return refresh();
}

/** 获取汇率快照(带缓存/单飞/SWR) */
export async function getRateSnapshot(): Promise<RateSnapshot> {
  if (cache && Date.now() - cache.at < FRESH_TTL_MS) return cache;

  // 过期但有旧值：立即返回旧值，后台静默刷新(SWR)
  if (cache) {
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null;
      });
    }
    return cache;
  }

  // 冷启动：必须等一份可用数据
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** 获取 1 USD 兑各币种汇率（兼容旧调用方） */
export async function getExchangeRates(): Promise<Record<string, number>> {
  return (await getRateSnapshot()).rates;
}

/** 服务端读取当前币种(来自 cookie) */
export async function getCurrencyCode(): Promise<string> {
  return parseCurrencyCode((await cookies()).get(CURRENCY_COOKIE)?.value);
}

/** 服务端格式化：USD 基础金额 → 当前币种显示 */
export async function formatPrice(amountBase: number): Promise<string> {
  const code = await getCurrencyCode();
  const { rates } = await getRateSnapshot();
  const rate = rates[code] ?? 1;
  return formatAmount(convertPrice(amountBase, rate), code);
}

/** 服务端显示当前币种标签，如 China (CNY ¥) */
export async function currencyLabel(): Promise<string> {
  const code = await getCurrencyCode();
  const def = getCurrencyDef(code);
  return `${def.country} (${def.code} ${def.symbol})`;
}

export { DEFAULT_CURRENCY };

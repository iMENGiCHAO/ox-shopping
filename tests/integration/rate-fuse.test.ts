import { describe, expect, it, afterEach, afterAll } from "vitest";
import { vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  assertRatesUsableForMoney,
  invalidateRateCache,
  RateUnavailableError,
  STALE_MAX_HOURS,
} from "@/components/shop/currency-server";

/**
 * 钱路径汇率熔断（2026-09-26 商用审计）：
 * 下单收款 / 佣金计提取到的汇率快照必须过 assertRatesUsableForMoney 闸门 ——
 * 拍脑袋的静态参考值或滞后台账超限的库内值绝不能用于资金结算。
 *
 * 测试直接操纵 fx.* 站点配置 + 模块内存缓存；用 vi.stubGlobal 让上游
 * live 拉取失败（测试机外网状态不可控，不能让用例依赖真实网络），
 * 从而稳定覆盖 refresh() 的库内回退分支：
 *   1. 库内快照新鲜（滞后 ≤72h）→ 放行
 *   2. 库内快照陈旧（>72h）且无管理员锁价 → 拒绝（RateUnavailableError）
 *   3. 库内快照陈旧但存在管理员锁价 → 放行（显式锁价 = 商业决策）
 *   4. db 回退快照必须套用锁价（修复：回退丢覆盖的回归）
 */

const RATES_KEY = "fx.rates";
const RATES_AT_KEY = "fx.ratesAt";
const OVERRIDES_KEY = "fx.overrides";

async function seedRates(at: Date): Promise<void> {
  const rates = { USD: 1, CNY: 7.2, EUR: 0.92 };
  await prisma.siteSetting.upsert({
    where: { key: RATES_KEY },
    update: { value: rates },
    create: { key: RATES_KEY, value: rates },
  });
  await prisma.siteSetting.upsert({
    where: { key: RATES_AT_KEY },
    update: { value: at.toISOString() },
    create: { key: RATES_AT_KEY, value: at.toISOString() },
  });
}

async function clearOverrides(): Promise<void> {
  await prisma.siteSetting.deleteMany({ where: { key: OVERRIDES_KEY } }).catch(() => {});
}

/** 强制上游 live 拉取失败（走库内回退分支），并失效模块缓存 */
function forceDbFallback(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled for test")));
  invalidateRateCache();
}

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateRateCache();
});

afterAll(async () => {
  // 清理：删测试造的 fx 键 + 失效缓存，让后续测试走正常 refresh 链路
  await prisma.siteSetting
    .deleteMany({ where: { key: { in: [RATES_KEY, RATES_AT_KEY, OVERRIDES_KEY] } } })
    .catch(() => {});
  invalidateRateCache();
});

describe("钱路径汇率熔断（assertRatesUsableForMoney）", () => {
  it("库内快照新鲜（1h 前）→ 放行", async () => {
    await clearOverrides();
    await seedRates(new Date(Date.now() - 1 * 3_600_000));
    forceDbFallback();
    const snap = await assertRatesUsableForMoney();
    expect(snap.rates.CNY).toBeGreaterThan(0);
    expect(snap.source).toBe("db");
  });

  it(`库内快照陈旧（${STALE_MAX_HOURS + 30}h 前）且无锁价 → 拒绝`, async () => {
    await clearOverrides();
    await seedRates(new Date(Date.now() - (STALE_MAX_HOURS + 30) * 3_600_000));
    forceDbFallback();
    await expect(assertRatesUsableForMoney()).rejects.toBeInstanceOf(RateUnavailableError);
  });

  it("陈旧但存在管理员锁价 → 放行（显式锁价 = 商业决策）", async () => {
    await seedRates(new Date(Date.now() - (STALE_MAX_HOURS + 30) * 3_600_000));
    await prisma.siteSetting.upsert({
      where: { key: OVERRIDES_KEY },
      update: { value: { CNY: 7.25 } },
      create: { key: OVERRIDES_KEY, value: { CNY: 7.25 } },
    });
    forceDbFallback();
    const snap = await assertRatesUsableForMoney();
    // 锁价优先生效：管理员设定值必须原样进入回退快照
    expect(snap.rates.CNY).toBe(7.25);
  });
});

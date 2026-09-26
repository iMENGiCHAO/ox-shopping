import { z } from "zod";
import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import {
  getAccountSummary,
  getDistributionConfig,
} from "@/server/services/distribution";
import { setSettlementCurrency, cnyRateForAccount } from "@/server/services/distribution/account.service";
import { listEnabledCurrencies } from "@/server/services/currency-config.service";

export const runtime = "nodejs";

/** GET /api/distribution/my/account — 我的分销账户（余额/冻结/累计/在途 + 结算币种） */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  const user = await requireUser();
  const [account, config, currencies] = await Promise.all([
    getAccountSummary(user.id),
    getDistributionConfig(),
    listEnabledCurrencies(),
  ]);
  // 最低提现额按账户结算币种折算后返回（配置以 CNY 心智维护；展示/校验同口径）
  const rate = await cnyRateForAccount(account.settlementCurrency);
  return json({
    account,
    minWithdrawAmount:
      rate > 0 ? Math.round((config.minWithdrawAmount / rate) * 100) / 100 : config.minWithdrawAmount,
    /** 可选的结算币种（后台「货币与汇率」enabled 列表） */
    settlementCurrencies: currencies.map((c) => ({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
    })),
  });
});

const setCurrencySchema = z.object({
  /** 3 位 ISO 4217；服务端校验「零余额且无流水才可变更」 */
  settlementCurrency: z
    .string()
    .trim()
    .length(3, "结算币种必须是 3 位 ISO 4217 代码"),
});

/** PUT /api/distribution/my/account — 设置/变更结算币种（零余额约束见服务层） */
export const PUT = apiHandler(async (req) => {
  assertDistributionEnabled();
  const user = await requireUser();
  // 商用审计修复：该路由此前无限流 —— 并发喷射 PUT 可与首笔计提竞态
  // （服务层已加行锁串行化，这里再压一层并发窗口）
  const rl = await rateLimit({
    key: `dist-settle-currency:${user.id}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) throw rateLimited();
  const input = await readJson(req, setCurrencySchema);
  const result = await setSettlementCurrency({
    userId: user.id,
    currency: input.settlementCurrency,
    req,
  });
  const account = await getAccountSummary(user.id);
  return json({ account, settlementCurrency: result.settlementCurrency });
});

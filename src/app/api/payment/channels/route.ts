import { apiHandler, json } from "@/lib/api";
import { listChannelsForFrontend } from "@/lib/payment/channel.service";

export const runtime = "nodejs";

/** 结算币种白名单（与 currency-provider 一致）；非法值按「未指定」处理 */
const CURRENCIES = new Set(["USD", "CNY", "EUR"]);

/**
 * GET /api/payment/channels?currency=USD — 前台支付渠道枚举。
 * 返回全部内置渠道及其可用状态（available），绝不含任何密钥；
 * 结算页据此渲染渠道单选：
 * - available=false 且无 currencyMismatch → 显示「暂未开通」置灰；
 * - currencyMismatch=true → 该渠道不支持当前币种（如 USD 下选支付宝），
 *   显示「请切换币种」置灰，避免顾客选到必然被网关拒绝的支付方式。
 */
export const GET = apiHandler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const currency = (sp.get("currency") ?? "").toUpperCase();
  const channels = await listChannelsForFrontend(CURRENCIES.has(currency) ? currency : undefined);
  return json({ channels });
});

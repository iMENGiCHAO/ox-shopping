import "server-only";
import { cookies } from "next/headers";
import { CURRENCY_COOKIE, DEFAULT_CURRENCY, parseCurrencyCode } from "@/components/shop/currency";
import { getRateSnapshot } from "@/components/shop/currency-server";
import { formatMoney } from "@/lib/utils";

/**
 * 把**基础币种 USD** 的金额渲染成「当前请求结算币种」的展示字符串。
 *
 * 为什么需要它：券码的门槛差额、减免额等提示文案在服务端生成，
 * 而服务端算出来的都是 USD 基础金额。若直接按 USD 渲染，
 * 选了 CNY/EUR 的用户会看到与结算页其它金额币种不一致的数字。
 */
export async function formatUsdInRequestCurrency(amountUsd: number): Promise<string> {
  let currency = DEFAULT_CURRENCY;
  try {
    currency = parseCurrencyCode((await cookies()).get(CURRENCY_COOKIE)?.value) || DEFAULT_CURRENCY;
  } catch {
    /* 非 request scope（如定时任务）下 cookies() 会抛，回落默认币种 */
  }
  const snap = await getRateSnapshot();
  const rate = snap.rates[currency] ?? 1;
  return formatMoney(Math.round(amountUsd * rate * 100) / 100, currency);
}

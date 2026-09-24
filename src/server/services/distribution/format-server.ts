/**
 * 服务端金额文案（通知/邮件用）。
 *
 * 与前端 `components/shop/distribution/format.ts` 的 `cny()` 同口径（¥ + 两位小数），
 * 但那份依赖前端模块；服务端通知不能在 Node 侧 import 客户端 bundle，故单列一份。
 */
// 分销结算币种固定 CNY。符号不写字面量（qa:hardcode 禁 ¥/€/£），
// 由 Intl 按币种生成——与前端 formatMoney(value, "CNY") 同口径。
const CNY_FMT = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  currencyDisplay: "narrowSymbol",
});

export function cnyText(
  // Prisma Decimal 有 toString()，Number() 可安全转换，这里不必逐点包 Number()
  amount: number | string | { toString(): string } | null | undefined,
): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return CNY_FMT.format(safe);
}

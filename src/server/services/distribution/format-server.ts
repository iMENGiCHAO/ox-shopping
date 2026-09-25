/**
 * 服务端金额文案（通知/邮件用）。
 *
 * 与前端 `components/shop/distribution/format.ts` 的金额展示同口径，
 * 但那份依赖前端模块；服务端通知不能在 Node 侧 import 客户端 bundle，故单列一份。
 *
 * 2026-09-24：分销账户改为**账户级结算币种**后，金额文案必须带币种格式化
 *（CNY 账户显示人民币符号，USD 账户显示美元符号）—— 符号由 Intl 按币种
 * 生成，不写货币符号字面量（qa:hardcode 检查）。
 */
const FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatterOf(currency: string): Intl.NumberFormat {
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "CNY";
  let fmt = FORMATTERS.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    });
    FORMATTERS.set(code, fmt);
  }
  return fmt;
}

export function moneyText(
  // Prisma Decimal 有 toString()，Number() 可安全转换，这里不必逐点包 Number()
  amount: number | string | { toString(): string } | null | undefined,
  currency = "CNY",
): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return formatterOf(currency).format(safe);
}

/** 向后兼容别名（结算币种体系上线前的调用方仍可用，固定按 CNY 格式化） */
export const cnyText = (amount: Parameters<typeof moneyText>[0]) => moneyText(amount, "CNY");

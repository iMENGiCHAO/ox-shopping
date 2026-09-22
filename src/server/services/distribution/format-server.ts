/**
 * 服务端金额文案（通知/邮件用）。
 *
 * 与前端 `components/shop/distribution/format.ts` 的 `cny()` 同口径（¥ + 两位小数），
 * 但那份依赖前端模块；服务端通知不能在 Node 侧 import 客户端 bundle，故单列一份。
 */
export function cnyText(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `¥${safe.toFixed(2)}`;
}

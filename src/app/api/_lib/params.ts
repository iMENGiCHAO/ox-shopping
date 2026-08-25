/**
 * 动态路由参数取值。
 * Handler 的 ctx.params 类型为 Record<string, string | string[]>，
 * 在 noUncheckedIndexedAccess 下索引访问会得到 string | string[] | undefined，
 * 统一在此收窄。
 */
export function routeParam(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}

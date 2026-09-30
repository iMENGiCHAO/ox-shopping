/**
 * 库存预警的单一事实来源。
 *
 * 之前阈值 `5` 散落三处（PDP buy-panel / 仪表盘 stats / 后台商品表高亮），
 * 改阈值要动三个文件且极易漂移 —— 收口到这里；管理端还可在
 * 「后台设置」用 SiteSetting.lowStockThreshold 覆盖缺省值（见 settings.service）。
 *
 * 两种口径语义不同，**不要合并**：
 * - 运营口径 isRestockAlert：库存 ≤ 阈值（含售罄 0——补货视角，售罄最需要关注）。
 *   仪表盘低库存计数 / 后台商品筛选 / 库存红色高亮三者共用，保证口径一致。
 * - 顾客口径 isScarceInStock：0 < 库存 ≤ 阈值（有货才谈「仅剩 N 件」的紧迫语义）。
 *   PDP buy-panel 的库存提示用这个，别把售罄商品渲染成「仅剩 0 件」。
 *
 * 本模块保持零依赖、零副作用（client/server 两侧均可安全引入）。
 */

export const LOW_STOCK_THRESHOLD = 5;

/**
 * 单预售商品（Pre-order）单次最多可购数量 —— 全站唯一口径（2026-09-30 商用审计）。
 *
 * 此前散落三处且只有 PDP/购物车页在管：抽屉 max=99、合并封顶 99、服务端下单
 * 无上限 —— PDP 承诺「最多 5 件」，抽屉/立即购买却能绕到 99 且下单被接受，
 * 违反业务规则、打乱备货。收口到这里：PDP / 购物车页 / 抽屉 / 合并 / 服务端
 * 下单五处同口径执行，API 直调也无法绕过。
 */
export const MAX_PRESALE_QTY = 5;

/** 运营口径：库存 ≤ 阈值（含售罄）——仪表盘计数 / 后台筛选 / 红色高亮共用 */
export function isRestockAlert(stock: number, threshold: number = LOW_STOCK_THRESHOLD): boolean {
  return stock <= threshold;
}

/** 顾客口径：0 < 库存 ≤ 阈值——PDP「仅剩 N 件」紧迫提示专用 */
export function isScarceInStock(stock: number, threshold: number = LOW_STOCK_THRESHOLD): boolean {
  return stock > 0 && stock <= threshold;
}

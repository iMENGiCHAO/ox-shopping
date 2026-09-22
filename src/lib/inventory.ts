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

/** 运营口径：库存 ≤ 阈值（含售罄）——仪表盘计数 / 后台筛选 / 红色高亮共用 */
export function isRestockAlert(stock: number, threshold: number = LOW_STOCK_THRESHOLD): boolean {
  return stock <= threshold;
}

/** 顾客口径：0 < 库存 ≤ 阈值——PDP「仅剩 N 件」紧迫提示专用 */
export function isScarceInStock(stock: number, threshold: number = LOW_STOCK_THRESHOLD): boolean {
  return stock > 0 && stock <= threshold;
}

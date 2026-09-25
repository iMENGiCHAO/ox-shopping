/**
 * 官方目录镜像的陈列规则（对齐 上游参考站 实测）：
 * - 首页按官方 frontpage 自定义顺序陈列 27 个商品（seed 的 createdAt 编码该顺序）
 * - /collections/all 按标题字母序陈列同样的 27 个商品
 * - 3 个 macrohard 新品未进入官方列表页，但 PDP 直链可访问
 */
export const OFFICIAL_LISTING_EXCLUDE_SLUGS = [
  "macrohard-rugby-shirt",
  "macrohard-jersey-shirt",
  "macrohard-remove-before-flight-keychain",
];

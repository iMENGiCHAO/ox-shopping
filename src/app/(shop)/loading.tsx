/**
 * 商城路由通用 Loading —— 按原站口径**不渲染骨架**。
 *
 * 大爷 2026-09-20 指正：刷新时会出现「四格带阴影的卡片占位」，而 shop.x.com 没有
 * 这种骨架闪烁（服务端直出真实内容）。骨架反而放大了慢卷上的首屏抖动，故移除。
 */
export default function ShopLoading() {
  return null;
}

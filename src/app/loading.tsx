/**
 * 根级路由骨架（错误边界审计补齐）：App Router 流式渲染时整页段等待 SSR 的
 * 兜底动画。各页面有自己的数据获取节奏，这里只给一个不跳版的居中指示器，
 * 避免导航时白屏；区域级骨架（如商品列表）由各 segment 自行细化。
 */
export default function RootLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-[60vh] w-full items-center justify-center"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
    </div>
  );
}

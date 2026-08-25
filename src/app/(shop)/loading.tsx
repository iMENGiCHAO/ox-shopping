/**
 * 商城路由通用 Loading 骨架 — x.com 式灰底脉冲：标题条 + 4 列卡片网格。
 */
export default function ShopLoading() {
  return (
    <div className="container py-12">
      <div className="mx-auto mb-10 h-8 w-56 animate-pulse bg-muted" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="mt-3 h-4 w-3/4 animate-pulse bg-muted" />
            <div className="mt-2 h-4 w-1/3 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

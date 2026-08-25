/** 搜索页骨架：居中标题 + 筛选栏 + 卡片网格 */
export default function SearchLoading() {
  return (
    <div className="container py-12">
      <div className="mx-auto mb-8 h-8 w-48 animate-pulse bg-muted" />
      <div className="mb-8 h-10 w-full animate-pulse bg-muted" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="mt-3 h-4 w-2/3 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/** 搜索页骨架（Suspense fallback）——筛选侧栏 + 结果网格 */
export default function Loading() {
  return (
    <div className="container py-8">
      <Skeleton className="h-8 w-56" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

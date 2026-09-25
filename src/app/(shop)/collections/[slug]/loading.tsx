import { Skeleton } from "@/components/ui/skeleton";

/** 集合页骨架（Suspense fallback）——头部横幅 + 商品网格 */
export default function Loading() {
  return (
    <div className="container py-8">
      <Skeleton className="h-10 w-64" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

/** 商品列表骨架（Suspense fallback）——此前全站无 loading.tsx，慢网下白屏 */
export default function Loading() {
  return (
    <div className="container py-8">
      <Skeleton className="h-8 w-48" />
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

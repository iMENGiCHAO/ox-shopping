import { Skeleton } from "@/components/ui/skeleton";

/** 订单列表骨架（Suspense fallback）——行卡片 */
export default function Loading() {
  return (
    <div className="container py-8">
      <Skeleton className="h-8 w-36" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

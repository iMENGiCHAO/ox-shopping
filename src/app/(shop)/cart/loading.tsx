import { Skeleton } from "@/components/ui/skeleton";

/** 购物车骨架（Suspense fallback）——行列表 + 小结卡片 */
export default function Loading() {
  return (
    <div className="container mx-auto max-w-[980px] space-y-6 py-16">
      <Skeleton className="h-8 w-40" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-lg border border-border p-4">
          <Skeleton className="h-24 w-24 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-3 py-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-9 w-28" />
          </div>
          <Skeleton className="h-4 w-20 self-center" />
        </div>
      ))}
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}

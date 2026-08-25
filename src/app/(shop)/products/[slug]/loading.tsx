/** PDP 骨架：左画廊 + 右信息栏 */
export default function PdpLoading() {
  return (
    <div className="container space-y-14 py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,60%)_1fr]">
        <div className="aspect-square w-full animate-pulse bg-muted" />
        <div className="space-y-5 pt-2">
          <div className="h-7 w-2/3 animate-pulse bg-muted" />
          <div className="h-5 w-24 animate-pulse bg-muted" />
          <div className="h-24 w-full animate-pulse bg-muted" />
          <div className="h-[46px] w-full max-w-xs animate-pulse bg-muted" />
          <div className="h-[46px] w-full max-w-xs animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  );
}

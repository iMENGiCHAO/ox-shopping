import { getT } from "@/lib/shop-i18n-server";
import { listProductReviews } from "@/server/services/review.service";
import { Stars } from "@/components/shop/stars";

/**
 * PDP 评价区（server 直拉，无客户端水合成本）：
 * 评分概览（★4.8 · 36 条）+ 评价列表（脱敏名 + 分页）。
 * 无评价时不渲染整个区块（诚实：没有数据不摆空架子）。
 */
export async function ProductReviews({ slug }: { slug: string }) {
  const t = await getT();
  const { rows, total } = await listProductReviews(slug, new URLSearchParams());
  if (total === 0 && rows.length === 0) return null;

  return (
    <section className="border-t border-border pt-12">
      <h2 className="mb-8 text-center text-[28px] font-normal leading-tight text-foreground">
        {t("Customer Reviews")} ({total})
      </h2>
      <div className="mx-auto max-w-3xl space-y-8">
        {rows.map((r) => (
          <article key={r.id} className="border-b border-border pb-8 last:border-0">
            <div className="mb-2 flex items-center justify-between">
              <Stars value={r.rating} />
              <span className="text-xs text-muted-foreground">{r.authorName}</span>
            </div>
            {r.title ? <h3 className="mb-1 text-sm font-semibold">{r.title}</h3> : null}
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">{r.content}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </p>
          </article>
        ))}
        {total > rows.length ? (
          <p className="pb-4 text-center text-xs text-muted-foreground">
            {t("Showing latest {n} of {total} reviews", { n: rows.length, total })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

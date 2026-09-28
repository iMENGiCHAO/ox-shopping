"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";

/**
 * 订单详情页「写评价」区块（DELIVERED 订单）：
 * 拉 /api/user/reviewable/[orderNumber] 得到可评行 → 逐行展开表单。
 * 已评行显示「已评价」徽标（服务层一人一品一评：更新走同一入口）。
 */
type ReviewableRow = {
  orderItemId: string;
  productName: string;
  attributes: { name: string; value: string }[] | null;
  reviewed: boolean;
};

export function OrderReviewSection({ orderNumber }: { orderNumber: string }) {
  const t = useT();
  const [rows, setRows] = useState<ReviewableRow[]>([]);
  const [reviewable, setReviewable] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<{ rows: ReviewableRow[]; reviewable: boolean }>(
      `/api/user/reviewable/${encodeURIComponent(orderNumber)}`,
    )
      .then((d) => {
        if (!alive) return;
        setRows(d.rows);
        setReviewable(d.reviewable);
      })
      .catch(() => {
        /* 静默：订单不可评时区块整体不渲染 */
      })
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [orderNumber]);

  if (!loaded || !reviewable || rows.length === 0) return null;

  return (
    <section className="mt-6 border-t border-border pt-6">
      <h2 className="mb-4 text-base font-semibold">{t("Reviews")}</h2>
      <div className="space-y-4">
        {rows.map((r) =>
          r.reviewed ? (
            <p key={r.orderItemId} className="text-sm text-muted-foreground">
              ✓ {r.productName} — {t("Already reviewed")}
            </p>
          ) : (
            <RowForm
              key={r.orderItemId}
              orderItemId={r.orderItemId}
              productName={r.productName}
              specText={
                r.attributes && r.attributes.length > 0
                  ? r.attributes.map((a) => `${a.name}: ${a.value}`).join(" · ")
                  : null
              }
              onDone={() => setRows((rs) => rs.map((x) => x.orderItemId === r.orderItemId ? { ...x, reviewed: true } : x))}
            />
          ),
        )}
      </div>
    </section>
  );
}

function RowForm({
  orderItemId,
  productName,
  specText,
  onDone,
}: {
  orderItemId: string;
  productName: string;
  specText: string | null;
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (content.trim().length < 5) {
      toast.error(t("Review content must be at least 5 characters"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/user/reviews", {
        method: "POST",
        body: JSON.stringify({
          orderItemId,
          rating,
          title: title.trim() || null,
          content: content.trim(),
        }),
      });
      toast.success(t("Thank you! Your review has been published."));
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to submit review"));
    } finally {
      setSubmitting(false);
    }
  }, [content, onDone, orderItemId, rating, t, title]);

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{productName}</p>
          {specText ? <p className="text-xs text-muted-foreground">{specText}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm underline underline-offset-4 hover:no-underline"
        >
          {open ? t("Cancel") : t("Write a review")}
        </button>
      </div>
      {open ? (
        <div className="mt-4 space-y-3">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">{t("Rating")}</legend>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i)}
                aria-label={`${i} ${t("Rating")}`}
                className={`text-xl leading-none ${i <= rating ? "text-foreground" : "text-border"}`}
              >
                ★
              </button>
            ))}
          </fieldset>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={t("Review title (optional)")}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t("Share your experience with this product…")}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/30"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {submitting ? t("Submitting…") : t("Submit review")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

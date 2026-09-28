"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";
import { EmptyState } from "@/components/ui/empty-state";

type MyReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  content: string;
  status: string;
  createdAt: string;
  product: { slug: string; name: string };
};

export default function MyReviewsPage() {
  const t = useT();
  const [rows, setRows] = useState<MyReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ rows: MyReviewRow[] }>("/api/user/reviews?pageSize=50");
      setRows(d.rows);
    } catch {
      toast.error(t("Failed to load reviews"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const del = async (id: string) => {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    try {
      await apiFetch(`/api/user/reviews/${id}`, { method: "DELETE" });
      toast.success(t("Review deleted"));
    } catch {
      setRows(prev);
      toast.error(t("Failed to delete review"));
    }
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">…</p>;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("My Reviews")}</h2>
      {rows.length === 0 ? (
        <EmptyState
          title={t("No reviews yet")}
          description={t("After an order is delivered, you can review it from the order page.")}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <article key={r.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/products/${r.product.slug}`}
                  className="text-sm font-medium hover:underline"
                >
                  {r.product.name}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-foreground">
                    {"★".repeat(r.rating)}
                    <span className="text-border">{"★".repeat(5 - r.rating)}</span>
                  </span>
                  {r.status === "REJECTED" ? (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                      {t("Hidden by moderation")}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void del(r.id)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
                  >
                    {t("Delete")}
                  </button>
                </div>
              </div>
              {r.title ? <p className="mt-2 text-sm font-medium">{r.title}</p> : null}
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/75">{r.content}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

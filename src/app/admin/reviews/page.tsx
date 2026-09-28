"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useT } from "@/components/admin/lang-provider";
import { apiFetch } from "@/lib/fetch-client";

type AdminReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  content: string;
  status: "APPROVED" | "REJECTED";
  createdAt: string;
  product: { slug: string; name: string };
  authorName: string;
  authorEmail: string;
};

export default function AdminReviewsPage() {
  const t = useT();
  const [rows, setRows] = useState<AdminReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = status ? `?status=${status}` : "";
      const d = await apiFetch<{ rows: AdminReviewRow[] }>(`/api/admin/reviews${q}`);
      setRows(d.rows);
    } catch {
      toast.error(t("Failed to load reviews"));
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setSt = async (id: string, next: "APPROVED" | "REJECTED") => {
    try {
      await apiFetch(`/api/admin/reviews/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
      toast.success(next === "REJECTED" ? t("Review hidden") : t("Review restored"));
    } catch {
      toast.error(t("Operation failed"));
    }
  };

  return (
    <div>
      <AdminPageHeader
        title={t("Reviews")}
        description={t("Moderate customer reviews — hidden ones stay off the storefront.")}
      />
      <div className="mb-4 flex gap-2 text-sm">
        {["", "APPROVED", "REJECTED"].map((v) => (
          <button
            key={v || "ALL"}
            type="button"
            onClick={() => setStatus(v)}
            className={`rounded-full border px-3 py-1 ${
              status === v ? "border-foreground bg-foreground text-background" : "border-border"
            }`}
          >
            {v === "" ? t("All") : v === "APPROVED" ? t("Visible") : t("Hidden")}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Star className="h-6 w-6" />} title={t("No reviews")} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Product")}</TableHead>
                <TableHead>{t("Rating")}</TableHead>
                <TableHead className="min-w-64">{t("Content")}</TableHead>
                <TableHead>{t("Customer")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.product.name}</TableCell>
                  <TableCell className="text-sm">{"★".repeat(r.rating)}</TableCell>
                  <TableCell className="max-w-md text-sm">
                    {r.title ? <p className="font-medium">{r.title}</p> : null}
                    <p className="line-clamp-3 text-muted-foreground">{r.content}</p>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.authorName}
                    <br />
                    <span className="text-muted-foreground">{r.authorEmail}</span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.status === "APPROVED" ? t("Visible") : t("Hidden")}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "APPROVED" ? (
                      <button
                        type="button"
                        onClick={() => void setSt(r.id, "REJECTED")}
                        className="text-xs text-destructive underline underline-offset-2"
                      >
                        {t("Hide")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void setSt(r.id, "APPROVED")}
                        className="text-xs underline underline-offset-2"
                      >
                        {t("Restore")}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/fetch-client";

interface NotifyRow {
  id: string;
  email: string;
  productId: string | null;
  /** 客户登记时选择的规格，如 {"Color":"Black","Size":"M"} */
  attributes?: Record<string, string> | null;
  status: string;
  createdAt: string;
  /** 联表出的商品信息（可能已删除为 null） */
  product?: {
    id: string;
    name: string;
    nameEn: string | null;
    slug: string;
    images: unknown;
  } | null;
}

/** 规格对象 → "Color: Black / Size: M" */
function variantText(attrs?: Record<string, string> | null): string {
  if (!attrs || typeof attrs !== "object") return "";
  return Object.entries(attrs)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([g, v]) => `${g}: ${v}`)
    .join(" / ");
}

/** 到货通知 — 售罄商品 Notify me 订阅列表 */
export default function AdminNotifyMePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotifyRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: NotifyRow[] }>("/api/admin/notify-me");
      setRows(res.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm("删除该条到货通知？")) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/notify-me/${id}`, { method: "DELETE" });
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="到货通知"
        description="售罄商品页面 Notify me 收集的订阅，可删除；可导出邮箱做补货营销"
      />
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Bell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">暂无到货通知订阅</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{r.email}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.product ? (
                      <a
                        href={`/products/${r.product.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground/80 underline decoration-border underline-offset-2 hover:text-foreground"
                      >
                        {r.product.nameEn ?? r.product.name}
                      </a>
                    ) : r.productId ? (
                      `商品 ${r.productId.slice(-8)}`
                    ) : (
                      "全店"
                    )}
                    {" · "}
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </p>
                  {variantText(r.attributes) ? (
                    <p className="mt-1 truncate text-xs text-foreground/70">
                      关注规格：{variantText(r.attributes)}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    r.status === "notified"
                      ? "border border-border text-muted-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {r.status === "notified" ? "已通知" : "待通知"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                  disabled={busyId === r.id}
                  onClick={() => void remove(r.id)}
                >
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { useT } from "@/components/admin/lang-provider";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CellText } from "@/components/admin/cell-text";
import { apiFetch } from "@/lib/fetch-client";

interface NotifyRow {
  id: string;
  email: string;
  productId: string | null;
  /** 客户登记时选择的规格，如 {"Color":"Black","Size":"M"} */
  attributes?: Record<string, string> | null;
  status: string;
  createdAt: string;
  lang?: string | null;
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
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotifyRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: NotifyRow[] }>("/api/admin/notify-me");
      setRows(res.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load"));
    } finally {
      setLoading(false);
    }
    // t 来自 useT()，语言不变时引用稳定；加入依赖以满足 exhaustive-deps
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm(t("确定删除该条到货通知吗？"))) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/notify-me/${id}`, { method: "DELETE" });
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("删除失败"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Notify Me")}
        description={t("售罄商品页面 Notify me 收集的订阅，可删除；可导出邮箱做补货营销")}
      />
      {loading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title={t("暂无到货通知订阅")}
          description={t("顾客在商品售罄时点「到货通知我」，订阅会出现在这里")}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-0">{t("Email")}</TableHead>
                  <TableHead className="hidden min-w-0 md:table-cell">{t("Products")}</TableHead>
                  <TableHead className="hidden min-w-0 lg:table-cell">{t("关注规格")}</TableHead>
                  <TableHead className="w-20">{t("语种")}</TableHead>
                  <TableHead className="w-24">{t("Status")}</TableHead>
                  <TableHead className="hidden w-[120px] xl:table-cell">{t("登记时间")}</TableHead>
                  <TableHead className="sticky-col-right w-20 text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <CellText value={r.email} title={r.email} className="text-sm font-medium" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.product ? (
                        <a
                          href={`/products/${r.product.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-foreground/80 underline decoration-border underline-offset-2 hover:text-foreground"
                          title={r.product.nameEn ?? r.product.name}
                        >
                          {r.product.nameEn ?? r.product.name}
                        </a>
                      ) : r.productId ? (
                        <span className="text-muted-foreground">{r.productId.slice(-8)}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("全站")}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <CellText
                        value={variantText(r.attributes) || "—"}
                        className="text-xs text-foreground/70"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          r.lang === "zh"
                            ? "inline-flex h-5 items-center whitespace-nowrap rounded bg-primary/10 px-1.5 text-[10px] font-medium leading-none text-primary"
                            : "inline-flex h-5 items-center whitespace-nowrap rounded bg-muted px-1.5 text-[10px] font-medium leading-none text-muted-foreground"
                        }
                      >
                        {r.lang === "zh" ? t("中文") : "EN"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          r.status === "notified"
                            ? "inline-flex h-5 items-center whitespace-nowrap rounded-full border border-border bg-secondary px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                            : "inline-flex h-5 items-center whitespace-nowrap rounded-full bg-warning/15 px-2 text-[10px] font-medium uppercase tracking-wider text-warning"
                        }
                      >
                        {r.status === "notified" ? t("已通知") : t("待通知")}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs tabular-nums text-muted-foreground xl:table-cell">
                      {new Date(r.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <DataTableActions
                        actions={
                          busyId === r.id
                            ? []
                            : [
                                {
                                  label: t("Delete"),
                                  icon: Trash2,
                                  onClick: () => void remove(r.id),
                                  destructive: true,
                                },
                              ]
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

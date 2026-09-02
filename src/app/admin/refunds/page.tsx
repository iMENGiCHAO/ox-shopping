"use client";

import * as React from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { REFUND_STATUS_LABELS } from "@/lib/order-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { RefundReviewDialog } from "@/components/admin/refund-review-dialog";
import { CellPair, CellText } from "@/components/admin/cell-text";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminListResult, AdminRefund, AdminRefundStatus } from "@/components/admin/types";

import { useT } from "@/components/admin/lang-provider";
const REFUND_TABS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "REQUESTED", label: "待审核" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已驳回" },
  { value: "REFUNDED", label: "已退款" },
];

const PAGE_SIZE = 10;

export default function AdminRefundsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminRefund[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [statusTab, setStatusTab] = React.useState("all");
  const [reviewing, setReviewing] = React.useState<AdminRefund | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (statusTab !== "all") params.set("status", statusTab);
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<AdminRefund>>(
        `/api/admin/refunds?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载退款列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusTab]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openReview = (refund: AdminRefund) => {
    setReviewing(refund);
    setReviewOpen(true);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("Refunds")} description={t("Review customer refund requests and track progress")} />

      <Tabs
        value={statusTab}
        onValueChange={(v) => {
          setStatusTab(v);
          setPage(1);
        }}
      >
        <TabsList>
          {REFUND_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">{t("Order #")}</TableHead>
                  <TableHead className="w-[160px]">用户</TableHead>
                  <TableHead className="w-24 text-right">{t("Refund Amount")}</TableHead>
                  <TableHead className="min-w-0">{t("Reason")}</TableHead>
                  <TableHead className="w-24">{t("Status")}</TableHead>
                  <TableHead className="w-[120px]">申请时间</TableHead>
                  <TableHead className="sticky-col-right w-20 text-right">
                    {t("Actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={`sk-${i}`}>
                      {Array.from({ length: 7 }, (_, j) => (
                        <TableCell
                          key={j}
                          className={j === 6 ? "sticky-col-right" : undefined}
                        >
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        icon={<RotateCcw className="h-6 w-6" />}
                        title={t("No refund requests")}
                        description="当前筛选下暂无退款申请"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((refund) => (
                    <TableRow key={refund.id}>
                      <TableCell className="font-mono text-xs">
                        {refund.order?.orderNumber ?? "-"}
                      </TableCell>
                      <TableCell>
                        <CellPair
                          primary={refund.user?.name ?? "-"}
                          secondary={refund.user?.email ?? "-"}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {formatMoney(refund.amount)}
                      </TableCell>
                      <TableCell>
                        <CellText value={refund.reason ?? "-"} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={refund.status} labelMap={{ ...REFUND_STATUS_LABELS }} />
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {formatDate(refund.createdAt)}
                      </TableCell>
                      <TableCell className="sticky-col-right">
                        <div className="flex justify-end">
                          {refund.status === "REQUESTED" ? (
                            <Button size="sm" className="h-8 px-2" onClick={() => openReview(refund)}>
                              <ShieldCheck className="h-3.5 w-3.5" />
                              审核
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-end"
      />

      <RefundReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        refund={reviewing}
        onReviewed={() => void load()}
      />
    </div>
  );
}

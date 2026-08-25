"use client";

import * as React from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { REFUND_STATUS_LABELS } from "@/lib/order-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { RefundReviewDialog } from "@/components/admin/refund-review-dialog";
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
  { value: "all", label: "All" },
  { value: "REQUESTED", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REFUNDED", label: "Refunded" },
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
      toast.error(err instanceof Error ? err.message : "Failed to load refunds");
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
          <div className="overflow-x-auto"><Table className="min-w-[880px]">
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <TableCell key={j}>
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
                      description="No refund requests match this filter"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell className="font-mono text-xs">
                      {refund.order?.orderNumber ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <div className="truncate text-sm">{refund.user?.name ?? "-"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {refund.user?.email ?? "-"}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-destructive">
                      {formatMoney(refund.amount)}
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="truncate" title={refund.reason}>
                        {refund.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={refund.status} labelMap={{ ...REFUND_STATUS_LABELS }} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(refund.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {refund.status === "REQUESTED" ? (
                          <Button size="sm" className="h-8 px-2" onClick={() => openReview(refund)}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Review
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
          </Table></div>
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

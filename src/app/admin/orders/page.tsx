"use client";

import * as React from "react";
import { Download, Eye, Search, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { OrderDetailDrawer } from "@/components/admin/order-detail-drawer";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { CellText, CellPair } from "@/components/admin/cell-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminListResult, AdminOrder, AdminOrderStatus } from "@/components/admin/types";

import { useT } from "@/components/admin/lang-provider";
const ORDER_STATUSES: AdminOrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

const PAGE_SIZE = 10;

/** 短时间格式：MM-DD HH:mm，配合 tabular-nums 防止抖列 */
const fmtShortDate = (iso: string) =>
  new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminOrdersPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [presaleOnly, setPresaleOnly] = React.useState(false);

  const [drawerOrder, setDrawerOrder] = React.useState<AdminOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  /* ---------------- 批量改状态（P1-8）----------------
     大促后几十上百单待发货，逐单点开改状态是纯人工损耗。
     这里只做选择与提交，真正的状态推进由 /api/admin/orders/batch-status
     逐单走 order.service（回补库存/退款/发信/COD 特例一并生效）。 */
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [batchStatus, setBatchStatus] = React.useState<AdminOrderStatus>("PROCESSING");
  const [batchBusy, setBatchBusy] = React.useState(false);

  // 换页/换筛选后清空选择（避免对看不见的行执行操作）
  React.useEffect(() => {
    setSelectedIds([]);
  }, [page, debouncedSearch, statusFilter, presaleOnly]);

  const toggleOne = (id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, presaleOnly]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (presaleOnly) params.set("presale", "true");
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<AdminOrder>>(
        `/api/admin/orders?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载订单失败");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, presaleOnly]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* ---------------- 订单认领（数据孤岛修复）----------------
     后端 POST/DELETE /api/admin/orders/[id]/assign 早已存在（含审计、
     认领即标已读），但 UI 一直没有入口——顾客订单谁来跟进无从知晓。
     列表行内认领/取消，详情抽屉内同样可操作。 */
  const [assigningId, setAssigningId] = React.useState<string | null>(null);

  const toggleAssign = async (row: AdminOrder) => {
    setAssigningId(row.id);
    try {
      await apiFetch(`/api/admin/orders/${row.id}/assign`, {
        method: row.assignee ? "DELETE" : "POST",
      });
      toast.success(
        row.assignee
          ? `已取消 #${row.orderNumber} 的认领`
          : `已认领 #${row.orderNumber}，请跟进处理`,
      );
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "认领操作失败");
    } finally {
      setAssigningId(null);
    }
  };

  /** Export CSV (current filters) */
  const handleExport = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (presaleOnly) params.set("presale", "true");
    params.set("pageSize", "500");
    window.open(`/api/admin/orders/export?${params.toString()}`, "_blank");
  };

  const openDrawer = (order: AdminOrder) => {
    setDrawerOrder(order);
    setDrawerOpen(true);
  };

  const runBatchStatus = async () => {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `确定将选中的 ${selectedIds.length} 个订单状态改为「${ORDER_STATUS_LABELS[batchStatus]}」吗？\n` +
          `（取消/退款会自动回补库存并走资金链路，请确认无误）`,
      )
    ) {
      return;
    }
    setBatchBusy(true);
    try {
      const res = await apiFetchRaw<{
        ok: number;
        failedCount: number;
        total: number;
        results: { orderNumber: string | null; ok: boolean; error?: string }[];
      }>("/api/admin/orders/batch-status", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, status: batchStatus }),
      });
      if (res.failedCount > 0) {
        const firstErr = res.results.find((r) => !r.ok);
        toast.warning(
          `成功 ${res.ok} 单，失败 ${res.failedCount} 单${firstErr?.error ? `：${firstErr.error}` : ""}`,
        );
      } else {
        toast.success(`已更新 ${res.ok} 个订单状态`);
      }
      setSelectedIds([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量更新失败");
    } finally {
      setBatchBusy(false);
    }
  };

  /** 当前页全选/取消全选 */
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : rows.map((r) => r.id));
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Orders")}
        description={t("View orders, advance status and ship")}
        actions={
          <Button variant="outline" onClick={handleExport} size="sm">
            <Download className="h-4 w-4" />
            导出 CSV
          </Button>
        }
      />

      {/* Filter toolbar — 紧凑 + 移动端换行 */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-0 flex-1 md:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search order # / recipient / email")}
                className="h-9 w-full pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full md:w-36">
                <SelectValue placeholder={t("All statuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All statuses")}</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex h-9 cursor-pointer select-none items-center gap-2 whitespace-nowrap text-sm">
              <input
                type="checkbox"
                checked={presaleOnly}
                onChange={(e) => setPresaleOnly(e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              {t("Pre-order only")}
            </label>
            <div className="hidden text-xs text-muted-foreground md:ml-auto md:block">
              共 {total} 条
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作条：仅在有选中行时出现，避免干扰日常浏览 */}
      {selectedIds.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <span className="text-sm font-medium">已选 {selectedIds.length} 单</span>
            <Select
              value={batchStatus}
              onValueChange={(v) => setBatchStatus(v as AdminOrderStatus)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* DELIVERED 不在批量列表：确认收货是顾客的权利（与单笔接口同规则） */}
                {(
                  ["PAID", "PROCESSING", "SHIPPED", "CANCELLED", "REFUNDED"] as AdminOrderStatus[]
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={batchBusy} onClick={() => void runBatchStatus()}>
              {batchBusy ? "处理中…" : "批量修改状态"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={batchBusy}
              onClick={() => setSelectedIds([])}
            >
              取消选择
            </Button>
            {batchStatus === "REFUNDED" ? (
              <span className="text-xs text-muted-foreground">
                批量退款属金额操作，仅 ADMIN 可执行
              </span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Orders table — table-fixed：列宽由 th/td 决定；首列/末列 sticky */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  {/* 批量选择：表头复选框切换当前页全选 */}
                  <TableHead className="sticky-col-left w-10">
                    <input
                      type="checkbox"
                      aria-label="全选当前页订单"
                      className="h-4 w-4 cursor-pointer align-middle accent-foreground"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  {/* sticky 左：订单号始终可见 */}
                  <TableHead className="sticky-col-left-2 w-[140px]">{t("Order #")}</TableHead>
                  <TableHead className="w-[180px]">用户</TableHead>
                  {/* 商品列：宽度自适应 */}
                  <TableHead className="hidden md:table-cell">商品</TableHead>
                  <TableHead className="w-24 text-right">金额</TableHead>
                  <TableHead className="w-24">{t("Status")}</TableHead>
                  <TableHead className="hidden w-24 lg:table-cell">支付方式</TableHead>
                  <TableHead className="hidden w-[120px] xl:table-cell">下单时间</TableHead>
                  {/* sticky 右：操作列始终可见 */}
                  <TableHead className="sticky-col-right w-[130px] text-right">
                    {t("Actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={`sk-${i}`}>
                      {Array.from({ length: 9 }, (_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <EmptyState
                        icon={<Search className="h-6 w-6" />}
                        title={t("No orders yet")}
                        description="请尝试调整筛选条件"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const firstItem = row.items && row.items.length > 0 ? row.items[0] : undefined;
                    const itemCount = row.items?.length ?? 0;
                    const productLine = firstItem
                      ? `${firstItem.productName}${itemCount > 1 ? ` 等 ${itemCount} 件` : ""}`
                      : "-";
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => openDrawer(row)}
                      >
                        {/* 批量选择：点击复选框不打开抽屉（stopPropagation） */}
                        <TableCell
                          className="sticky-col-left w-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`选择订单 ${row.orderNumber}`}
                            className="h-4 w-4 cursor-pointer align-middle accent-foreground"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleOne(row.id)}
                          />
                        </TableCell>
                        {/* sticky 左：保持订单号可见 */}
                        <TableCell className="sticky-col-left-2 w-[140px]">
                          <CellText
                            value={
                              <span className="font-mono text-[13px] font-medium text-primary">
                                {row.orderNumber}
                              </span>
                            }
                            title={row.orderNumber}
                          />
                        </TableCell>
                        <TableCell className="w-[180px]">
                          <CellPair
                            primary={row.user?.name ?? "-"}
                            secondary={row.user?.email ?? "-"}
                          />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <CellText value={productLine} title={productLine} />
                        </TableCell>
                        <TableCell className="w-24 text-right font-medium tabular-nums">
                          <div>{formatMoney(row.total, row.currency || "USD")}</div>
                          {row.currency && row.currency !== "CNY" ? (
                            <div className="text-[10px] text-muted-foreground">{row.currency}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="w-24">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge
                              status={row.status}
                              labelMap={{ ...ORDER_STATUS_LABELS }}
                            />
                            {row.assignee ? (
                              <span
                                className="max-w-full truncate rounded bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground"
                                title={`认领人：${row.assignee.name}（${row.assignee.email}）`}
                              >
                                {row.assignee.name}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden w-28 lg:table-cell">
                          {row.paymentProvider === "stripe" ? (
                            <span className="text-xs">Stripe</span>
                          ) : row.paymentProvider === "mock" ? (
                            <span className="text-xs text-muted-foreground">模拟支付</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden w-[120px] text-xs tabular-nums text-muted-foreground xl:table-cell">
                          {fmtShortDate(row.createdAt)}
                        </TableCell>
                        {/* sticky 右：操作列始终可见 */}
                        <TableCell
                          className="sticky-col-right w-[130px] text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DataTableActions
                            actions={[
                              {
                                label: "查看详情",
                                icon: Eye,
                                onClick: () => openDrawer(row),
                                primary: true,
                              },
                              {
                                label:
                                  assigningId === row.id
                                    ? row.assignee
                                      ? "取消认领中…"
                                      : "认领中…"
                                    : row.assignee
                                      ? `取消认领（${row.assignee.name}）`
                                      : "认领跟进",
                                icon: UserCheck,
                                onClick: () => void toggleAssign(row),
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground sm:block">
          {total > 0 ? `共 ${total} 条记录，第 ${page} / ${totalPages || 1} 页` : ""}
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {/* Order detail drawer */}
      <OrderDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        order={drawerOrder}
        onChanged={() => void load()}
      />
    </div>
  );
}

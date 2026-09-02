"use client";

import * as React from "react";
import { Download, Eye, Search } from "lucide-react";
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

      {/* Orders table — table-fixed：列宽由 th/td 决定；首列/末列 sticky */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  {/* sticky 左：订单号始终可见 */}
                  <TableHead className="sticky-col-left w-[140px]">
                    {t("Order #")}
                  </TableHead>
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
                      {Array.from({ length: 8 }, (_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
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
                        {/* sticky 左：保持订单号可见 */}
                        <TableCell className="sticky-col-left w-[140px]">
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
                          {formatMoney(row.total)}
                        </TableCell>
                        <TableCell className="w-24">
                          <StatusBadge status={row.status} labelMap={{ ...ORDER_STATUS_LABELS }} />
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
                        <TableCell className="hidden w-[120px] text-xs text-muted-foreground tabular-nums xl:table-cell">
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
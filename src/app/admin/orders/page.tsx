"use client";

import * as React from "react";
import { Download, Eye, Search } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { OrderDetailDrawer } from "@/components/admin/order-detail-drawer";
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
      toast.error(err instanceof Error ? err.message : "Failed to load orders");
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
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filter toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search order # / recipient / email")}
                className="h-10 w-72 pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder={t("All statuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={presaleOnly}
                onChange={(e) => setPresaleOnly(e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              {t("Pre-order only")}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Orders table */}
      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Items</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="hidden lg:table-cell">Payment</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead className="w-24 text-right">{t("Actions")}</TableHead>
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
                      description="Try adjusting your filters"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const firstItem = row.items && row.items.length > 0 ? row.items[0] : undefined;
                  const itemCount = row.items?.length ?? 0;
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => openDrawer(row)}
                    >
                      <TableCell>
                        <span className="font-medium text-primary">{row.orderNumber}</span>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="truncate text-sm">{row.user?.name ?? "-"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.user?.email ?? "-"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] md:table-cell">
                        <div className="truncate" title={firstItem?.productName}>
                          {firstItem
                            ? `${firstItem.productName}${itemCount > 1 ? ` et al. ${itemCount} items` : ""}`
                            : "-"}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatMoney(row.total)}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} labelMap={{ ...ORDER_STATUS_LABELS }} />
                      </TableCell>
                      <TableCell>
                        {row.paymentProvider === "stripe"
                          ? "Stripe"
                          : row.paymentProvider === "mock"
                            ? "Mock payment"
                            : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString("zh-CN")}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(row);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-end"
      />

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

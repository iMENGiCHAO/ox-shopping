"use client";

import { useCallback, useEffect, useState } from "react";
import { PackageOpen } from "lucide-react";
import { toast } from "sonner";
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
import { useShopLang, useT } from "@/components/shop/lang-provider";
import { apiFetchRaw } from "@/lib/fetch-client";
import type { TeamOrderRow } from "@/lib/distribution/contract";
import type { Paginated, PaginationMeta } from "@/components/shop/distribution/types";
import {
  cny,
  formatDateTime,
  money,
  orderStatusLabel,
} from "@/components/shop/distribution/format";
import { OrderStatusBadge, TableSkeleton } from "@/components/shop/distribution/ui";

const PAGE_SIZE = 10;

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/** 状态筛选项：与订单页常用状态保持一致，避免多出没人用的选项 */
const STATUS_VALUES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

/** 我的直接客户订单：间接下级只进 /stats 汇总，这里永远看不到他们的明细 */
export default function DistributionOrdersPage() {
  const t = useT();
  const { lang } = useShopLang();
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TeamOrderRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status !== "ALL") qs.set("status", status);
      const res = await apiFetchRaw<Paginated<TeamOrderRow>>(
        `/api/distribution/my/orders?${qs.toString()}`,
      );
      setRows(res.data ?? []);
      setPagination(res.pagination ?? EMPTY_PAGINATION);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [page, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("My Orders")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(
              "Only orders from your direct customers are listed — sub-team orders are summarised only.",
            )}
          </p>
        </div>
        <div className="w-full sm:w-52">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label={t("Status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("All")}</SelectItem>
              {STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {orderStatusLabel(t, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-5 w-5" />}
          title={t("No matching orders")}
          description={t("No orders from your direct customers yet.")}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Order number")}</TableHead>
                <TableHead>{t("Buyer")}</TableHead>
                <TableHead>{t("Phone")}</TableHead>
                <TableHead>{t("Region")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Amount")}</TableHead>
                <TableHead>{t("Time")}</TableHead>
                <TableHead className="text-right">{t("My commission")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.orderNumber}-${row.createdAt}`}>
                  <TableCell className="truncate text-sm font-medium">{row.orderNumber}</TableCell>
                  <TableCell className="truncate text-sm">{row.buyerName}</TableCell>
                  <TableCell className="text-sm">{row.buyerPhone || "-"}</TableCell>
                  <TableCell className="truncate text-sm">{row.region || "-"}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {money(row.total, row.currency)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt, lang)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.myCommissionCny === null ? "-" : cny(row.myCommissionCny)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

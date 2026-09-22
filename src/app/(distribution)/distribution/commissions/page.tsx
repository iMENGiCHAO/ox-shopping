"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
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
import type { CommissionRow, CommissionState } from "@/lib/distribution/contract";
import type { Paginated, PaginationMeta } from "@/components/shop/distribution/types";
import {
  cny,
  commissionStatusLabel,
  formatDateTime,
  levelLabel,
  money,
} from "@/components/shop/distribution/format";
import { CommissionStatusBadge, TableSkeleton } from "@/components/shop/distribution/ui";

const PAGE_SIZE = 20;

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

const STATUS_VALUES: CommissionState[] = ["PENDING", "SETTLED", "REVERSED"];

/** 佣金明细：状态筛选项与服务端白名单一致，传别的值服务端会当成不过滤 */
export default function DistributionCommissionsPage() {
  const t = useT();
  const { lang } = useShopLang();
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status !== "ALL") qs.set("status", status);
      const res = await apiFetchRaw<Paginated<CommissionRow>>(
        `/api/distribution/my/commissions?${qs.toString()}`,
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
          <h2 className="text-lg font-semibold">{t("Commission Details")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("Every commission you have earned.")}
          </p>
        </div>
        <div className="w-full sm:w-44">
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
                  {commissionStatusLabel(t, value)}
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
          icon={<Coins className="h-5 w-5" />}
          title={t("No commission records yet.")}
          description={t("Commissions appear here once an order is paid.")}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Order number")}</TableHead>
                <TableHead className="text-right">{t("Order amount")}</TableHead>
                <TableHead>{t("Level")}</TableHead>
                <TableHead className="text-right">{t("Rate")}</TableHead>
                <TableHead className="text-right">{t("Commission")}</TableHead>
                <TableHead className="text-right">{t("Converted to CNY")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Time")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="truncate text-sm font-medium">{row.orderNumber}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {money(row.orderAmount, row.currency)}
                  </TableCell>
                  <TableCell className="text-sm">{levelLabel(t, row.level)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{row.ratio}%</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {money(row.amount, row.currency)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cny(row.amountCny)}
                  </TableCell>
                  <TableCell>
                    <CommissionStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <p>{formatDateTime(row.createdAt, lang)}</p>
                    {row.settledAt ? (
                      <p className="mt-0.5">
                        {t("Settled at")} {formatDateTime(row.settledAt, lang)}
                      </p>
                    ) : null}
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

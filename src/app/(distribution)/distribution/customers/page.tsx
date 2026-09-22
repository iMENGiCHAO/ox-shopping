"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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
import type {
  MyCustomerRow,
  Paginated,
  PaginationMeta,
} from "@/components/shop/distribution/types";
import { bindSourceLabel, cny, formatDateTime } from "@/components/shop/distribution/format";
import { TableSkeleton } from "@/components/shop/distribution/ui";

const PAGE_SIZE = 10;

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/** 我的直接客户：搜索走服务端（脱敏后的昵称/邮箱），前端只负责 350ms 防抖 */
export default function DistributionCustomersPage() {
  const t = useT();
  const { lang } = useShopLang();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<MyCustomerRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);

  // 防抖 + 同一次批处理里回到第 1 页：否则改关键词后页码停在第 3 页会查到空列表
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (debouncedQuery) qs.set("q", debouncedQuery);
      const res = await apiFetchRaw<Paginated<MyCustomerRow>>(
        `/api/distribution/my/customers?${qs.toString()}`,
      );
      setRows(res.data ?? []);
      setPagination(res.pagination ?? EMPTY_PAGINATION);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("My Customers")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("Customers you personally referred.")}
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search by nickname or email")}
            className="h-10"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={debouncedQuery ? t("No matching customers") : t("No customers yet")}
          description={
            debouncedQuery
              ? t("Try another keyword.")
              : t("Share your promotion link to get your first customer.")
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Customer")}</TableHead>
                <TableHead>{t("Phone")}</TableHead>
                <TableHead>{t("Source")}</TableHead>
                <TableHead>{t("Bound at")}</TableHead>
                <TableHead className="text-right">{t("Orders")}</TableHead>
                <TableHead className="text-right">{t("Total spent")}</TableHead>
                <TableHead className="text-right">{t("My commission")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>
                  <TableCell className="text-sm">{row.phone || "-"}</TableCell>
                  <TableCell className="text-sm">{bindSourceLabel(t, row.source)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(row.bindTime, lang)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.orderCount}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cny(row.spentCny)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cny(row.myCommissionCny)}
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

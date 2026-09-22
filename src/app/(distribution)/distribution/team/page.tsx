"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
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
import { useT } from "@/components/shop/lang-provider";
import { apiFetch } from "@/lib/fetch-client";
import type { TeamStatsResponse } from "@/components/shop/distribution/types";
import { cny, formatDate } from "@/components/shop/distribution/format";
import { StatCard, TableSkeleton } from "@/components/shop/distribution/ui";

/** 可选窗口：服务端接受 1–365，这里只放三个常用档，省得用户填数字 */
const DAY_OPTIONS = [7, 30, 90];

/** 团队业绩（默认 30 天）：按日表只给数字，服务端也不下发下级订单明细 */
export default function DistributionTeamPage() {
  const t = useT();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<TeamStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<TeamStatsResponse>(`/api/distribution/my/stats?days=${days}`);
      setStats(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [days, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Team Performance")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("Daily performance of your whole team.")}
          </p>
        </div>
        <div className="w-full sm:w-44">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger aria-label={t("Team Performance")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {t("Last {n} days", { n: value })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Team orders")} value={stats?.totalOrders ?? 0} />
        <StatCard label={t("Team sales")} value={cny(stats?.totalSalesCny ?? 0)} />
        <StatCard label={t("My commission")} value={cny(stats?.myTotalCommissionCny ?? 0)} />
      </div>

      <section>
        <h3 className="mb-3 text-sm font-medium">{t("Daily breakdown")}</h3>
        {loading ? (
          <TableSkeleton />
        ) : !stats || stats.series.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title={t("No performance data for this period.")}
            description={t("Daily performance of your whole team.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead className="text-right">{t("Orders")}</TableHead>
                <TableHead className="text-right">{t("Team sales")}</TableHead>
                <TableHead className="text-right">{t("My commission")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.series.map((row) => (
                <TableRow key={row.date}>
                  <TableCell className="text-sm tabular-nums">{formatDate(row.date)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{row.orders}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cny(row.salesCny)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {cny(row.commissionCny)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

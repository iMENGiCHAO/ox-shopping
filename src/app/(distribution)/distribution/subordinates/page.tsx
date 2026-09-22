"use client";

import { useCallback, useEffect, useState } from "react";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useShopLang, useT } from "@/components/shop/lang-provider";
import { apiFetch } from "@/lib/fetch-client";
import type { SubordinatesResponse } from "@/components/shop/distribution/types";
import { formatDateTime } from "@/components/shop/distribution/format";
import { StatCard } from "@/components/shop/distribution/ui";

/**
 * 我的下级：直接下级给明细，间接下级只给人数。
 * 这是隐私口径，不是产品取舍 —— 服务端本来就不下发间接下级的任何身份字段。
 */
export default function DistributionSubordinatesPage() {
  const t = useT();
  const { lang } = useShopLang();
  const [data, setData] = useState<SubordinatesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<SubordinatesResponse>("/api/distribution/my/subordinates");
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const direct = data?.direct ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("My Subordinates")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("People who signed up through your link.")}
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-medium">{t("Direct subordinates")}</h3>
        {direct.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("You have no direct subordinates yet.")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Customer")}</TableHead>
                <TableHead>{t("Joined at")}</TableHead>
                <TableHead>{t("Distributor")}</TableHead>
                <TableHead className="text-right">{t("Customers")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {direct.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(row.joinedAt, lang)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isDistributor ? "success" : "outline"}>
                      {row.isDistributor ? t("Yes") : t("No")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{row.bindCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium">{t("Indirect subordinates")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label={t("Indirect subordinates")} value={data?.indirect.count ?? 0} />
          <StatCard label={t("Team size")} value={data?.teamCount ?? 0} />
        </div>
        <Card className="panel mt-3">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
            <Network className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {t(
                "Indirect subordinates are summarised only — their customer and order details are not shown.",
              )}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

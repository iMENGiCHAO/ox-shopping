"use client";

import * as React from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useT } from "@/components/admin/lang-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "../_shared";

interface RiskFinding {
  id: string;
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  refType: string;
  refId: string;
  at: string;
}

interface RiskResponse {
  findings: RiskFinding[];
  counts: Record<string, number>;
}

/** 下面两项的 label 为词典键（渲染时经 t() 解析），不是直接展示的文案 */
const KIND_LABELS: Record<string, string> = {
  self_purchase: "自购返佣",
  negative_balance: "负余额挂账",
  high_refund: "高频退款",
  large_withdraw: "大额提现",
  over_level_rule: "超层级规则",
};

const SEVERITY: Record<
  RiskFinding["severity"],
  { label: string; variant: "destructive" | "warning" | "secondary" }
> = {
  high: { label: "高", variant: "destructive" },
  medium: { label: "中", variant: "warning" },
  low: { label: "低", variant: "secondary" },
};

/**
 * 风控视图（P1-8）。
 *
 * 分销系统最容易出事的不是"算不出来"，而是"算错了没人看见"：自买自返、刷单刷完退款、
 * 冲正把余额扣成负数、配置了永不生效的层级规则…… 这一页把这些信号集中成一张列表，
 * 并按严重程度排序，运营每天扫一眼就能发现异常。
 */
export default function AdminDistributionRiskPage() {
  const t = useT();
  const [data, setData] = React.useState<RiskResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<RiskResponse>("/api/admin/distribution/risk"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("加载风控视图失败"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const order: Record<RiskFinding["severity"], number> = { high: 0, medium: 1, low: 2 };
  const findings = [...(data?.findings ?? [])].sort(
    (a, b) => order[a.severity] - order[b.severity] || b.at.localeCompare(a.at),
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("风控视图")}
        description={t(
          "自购返佣、负余额挂账、高频退款、大额在途提现、永不生效的超层级规则 —— 按严重程度排序，建议每天扫一眼",
        )}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("刷新")}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(KIND_LABELS).map(([kind, label]) => (
          <Card key={kind}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t(label)}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{data?.counts?.[kind] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            {t("异常信号")}
          </CardTitle>
          <CardDescription>
            {t(
              "自购返佣与负余额属于「钱已经算错」的高优信号；高频退款与最层级规则属于「需要复核」。",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : findings.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-5 w-5" />}
              title={t("暂无异常信号")}
              description={t(
                "当前没有检出风险项：没有自购返佣、没有负余额账户，也没有超层级规则。",
              )}
            />
          ) : (
            <ul className="divide-y divide-border">
              {findings.map((f) => (
                <li key={f.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Badge variant={SEVERITY[f.severity].variant}>
                        {t(SEVERITY[f.severity].label)}
                      </Badge>
                      {f.title}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(f.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Coins,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatCard, formatCny, formatPercent } from "../_shared";

interface AdminReport {
  days: number;
  paidOrders: number;
  paidRevenueCny: number;
  /** 佣金总支出（净额口径）= 已结算 + 待结算，不含已全额冲正的流水 */
  commissionTotalCny: number;
  /** 其中已结算（净额：已扣除冲正部分，与分销商账上余额口径一致） */
  commissionSettledCny: number;
  commissionPendingCny: number;
  commissionReversedCny: number;
  estimatedGrossProfitCny: number;
  /** 有成本价的行项占比（%）；0 表示一条成本都没录，毛利完全不可信 */
  costCoverage: number;
  payoutRatio: number;
}

interface AdminOverview {
  distributors: number;
  teamMembers: number;
  binds: number;
}

const DAY_OPTIONS = [7, 30, 90];

/**
 * 对账报表。
 *
 * 这一页的数字里有一个**必须打预防针**的：毛利。
 * `estimatedGrossProfitCny` 是用 `Product.costPrice` 估的，而成本价是运营选填的 ——
 * 没录成本的行项按成本 0 计入，会把「没录成本」直接算成「毛利 100%」。
 * 所以页面上把成本覆盖率与毛利结论绑在一起讲，覆盖率为 0 时明确标注不可信，
 * 而不是悄悄给一个好看的数字（大爷对「假毛利」零容忍）。
 */
export default function AdminReportsPage() {
  const [days, setDays] = React.useState(30);
  const [report, setReport] = React.useState<AdminReport | null>(null);
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ report: AdminReport; overview: AdminOverview }>(
        `/api/admin/distribution/reports?days=${days}`,
      );
      setReport(res.report);
      setOverview(res.overview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载对账报表失败");
    } finally {
      setLoading(false);
    }
  }, [days]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const coverage = report?.costCoverage ?? 0;
  const profitUntrustworthy = coverage <= 0;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="对账报表"
        description="近 N 天的收入、佣金支出与毛估毛利；用于判断「返佣比例是否吃穿利润」"
        actions={
          <>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32" aria-label="统计天数">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    近 {d} 天
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              刷新
            </Button>
          </>
        }
      />

      {/* 毛利口径预警：这条必须显眼，否则报表会被当成财务结论用 */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border p-3 text-xs leading-relaxed",
          profitUntrustworthy
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-warning/40 bg-warning/5 text-warning",
        )}
        role="note"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">
            毛利为估算值，依据商品 <span className="font-mono">Product.costPrice</span>
            （成本价）计算，不含运费、支付手续费、退款与其它成本。
          </p>
          <p className="mt-1">
            当前成本覆盖率{" "}
            <span className="font-semibold tabular-nums">{formatPercent(coverage)}</span>
            （有成本价的订单行项占比）。
            {profitUntrustworthy
              ? "覆盖率为 0，说明没有任何商品录入成本价，下方毛利数字按成本 0 计算，完全不可信 —— 请先在商品页补齐成本价。"
              : coverage < 80
                ? "覆盖率不足 80%，毛利被高估的幅度较大，只能当趋势看，不能当财务口径。"
                : "覆盖率良好，毛利数字具备参考价值。"}
          </p>
        </div>
      </div>

      {loading && !report ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={`rsk-${i}`} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={`已支付订单数（近 ${report?.days ?? days} 天）`}
              hint="口径：有支付时间、且未取消/未全额退款的订单"
              value={report?.paidOrders ?? 0}
              icon={ShoppingCart}
            />
            <StatCard
              label="收入"
              hint="多币种已按下单时汇率折算为人民币"
              value={formatCny(report?.paidRevenueCny)}
              icon={BadgeDollarSign}
              tone="info"
            />
            <StatCard
              label="佣金总支出"
              hint={`待结算 ${formatCny(report?.commissionPendingCny)} · 已冲正 ${formatCny(report?.commissionReversedCny)}`}
              value={formatCny(report?.commissionTotalCny)}
              icon={Coins}
              tone="warning"
            />
            <StatCard
              label="毛估毛利"
              hint={
                profitUntrustworthy
                  ? "成本覆盖率为 0，此数字不可信"
                  : "收入 − 估算成本（按 costPrice）"
              }
              value={formatCny(report?.estimatedGrossProfitCny)}
              icon={TrendingUp}
              tone={profitUntrustworthy ? "destructive" : "success"}
            />
            <StatCard
              label="成本覆盖率"
              hint="有成本价的订单行项占比；0 时毛利不可信"
              value={formatPercent(coverage)}
              tone={profitUntrustworthy ? "destructive" : coverage < 80 ? "warning" : "success"}
            />
            <StatCard
              label="佣金占收入比"
              hint="佣金总支出 ÷ 收入；对照毛利率判断是否返穿"
              value={formatPercent(report?.payoutRatio)}
              tone="default"
            />
          </div>

          {/* 佣金构成明细：总支出 = 已结算 + 待结算（均为净额），已冲正单列核对 */}
          <Card>
            <CardHeader>
              <CardTitle>佣金支出构成</CardTitle>
              <CardDescription>
                已结算 = 已进入分销商可提现余额；待结算 = 还在持有期或未确认收货。
                口径：三项均为**净额**（订单部分退款后，已冲正的部分已从支出中扣除）， 总支出 =
                已结算 + 待结算。已冲正单列 —— 它代表被撤销的佣金，
                既不算支出、也不该从支出里倒推（判断真实已付出的钱看「已结算」）。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">佣金总支出</span>
                <span className="font-medium tabular-nums">
                  {formatCny(report?.commissionTotalCny)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">其中待结算</span>
                <span className="tabular-nums">{formatCny(report?.commissionPendingCny)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">其中已结算</span>
                <span className="tabular-nums">{formatCny(report?.commissionSettledCny)}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">已冲正（不计入支出）</span>
                <span className="tabular-nums">{formatCny(report?.commissionReversedCny)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>全站累计（与时间窗无关）</CardTitle>
              <CardDescription>盘子有多大 —— 这三项不受上方天数切换影响</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">分销商</span>
                <span className="tabular-nums">{overview?.distributors ?? 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">团队关系数</span>
                <span className="tabular-nums">{overview?.teamMembers ?? 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
                <span className="text-muted-foreground">有效绑定数</span>
                <span className="tabular-nums">{overview?.binds ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

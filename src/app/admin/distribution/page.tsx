"use client";

import * as React from "react";
import {
  Link2,
  Network,
  RefreshCw,
  Share2,
  Users,
  Wallet,
  CheckCircle2,
  Clock,
  Scale,
  Undo2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useT } from "@/components/admin/lang-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, formatCny, COMMISSION_STATUS_LABELS } from "./_shared";

interface AdminOverview {
  distributors: number;
  teamMembers: number;
  binds: number;
  commissionByStatus: Record<string, { count: number; amountCny: number }>;
  pendingWithdraw: { count: number; amountCny: number };
}

interface ReconcileResult {
  ok: boolean;
  attributed: number;
  accrued: number;
  reversed: number;
  settled: number;
}

/** 三态卡的固定顺序与图标：待结算的钱还欠着、已结算的已经花出去、已冲正的是退回来的
 *  label 为词典键（含 {n} 占位符，渲染时经 t() + replace 解析），不是直接展示的文案 */
const COMMISSION_CARDS = [
  { key: "PENDING", label: "待结算佣金（{n} 笔）", icon: Clock, tone: "warning" as const },
  { key: "SETTLED", label: "已结算佣金（{n} 笔）", icon: CheckCircle2, tone: "success" as const },
  { key: "REVERSED", label: "已冲正佣金（{n} 笔）", icon: Undo2, tone: "destructive" as const },
];

/**
 * 分销总览。
 *
 * 只做「一眼看清盘子有多大 + 待办有多少」，明细一律去各自列表页；
 * 「立即对账」是运维兜底入口（与调度器每分钟跑的是同一个幂等函数），
 * 因此不做二次确认 —— 重复点击不会产生副作用，只是白跑一次扫描。
 */
export default function AdminDistributionOverviewPage() {
  const t = useT();
  const [overview, setOverview] = React.useState<AdminOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reconciling, setReconciling] = React.useState(false);
  const [settling, setSettling] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await apiFetch<AdminOverview>("/api/admin/distribution/overview"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("加载分销总览失败"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const res = await apiFetch<ReconcileResult>("/api/admin/distribution/reconcile", {
        method: "POST",
      });
      toast.success(
        t(
          "对账完成：补归属 {attributed} 单 · 补佣金 {accrued} 单 · 冲正 {reversed} 单 · 结算 {settled} 单",
        )
          .replace("{attributed}", String(res.attributed))
          .replace("{accrued}", String(res.accrued))
          .replace("{reversed}", String(res.reversed))
          .replace("{settled}", String(res.settled)),
      );
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("对账失败"));
    } finally {
      setReconciling(false);
    }
  };

  /** 手动结算（P0-5）：与调度器同一个幂等函数，用于 CRON 关闭/异常时兜底 */
  const settleManual = async () => {
    setSettling(true);
    try {
      const res = await apiFetch<{ mode: string; orders?: number; settled: number }>(
        "/api/admin/distribution/settle",
        { method: "POST", body: JSON.stringify({}) },
      );
      toast.success(
        res.settled > 0
          ? t("已结算 {n} 笔到期佣金").replace("{n}", String(res.settled))
          : t("没有到期可结算的佣金（未到持有期或已结算）"),
      );
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("结算失败"));
    } finally {
      setSettling(false);
    }
  };

  /** 账户对账（P0-6）：先只查不修，确认差异后再一键修复 */
  const verifyAccounts = async (apply: boolean) => {
    setVerifying(true);
    try {
      const res = await apiFetch<{
        accounts: number;
        drifted: { userId: string; email: string | null; drift: number }[];
        repaired: number;
      }>("/api/admin/distribution/verify", {
        method: "POST",
        body: JSON.stringify({ apply }),
      });
      if (res.drifted.length === 0) {
        toast.success(t("对账通过：{n} 个账户与流水一致").replace("{n}", String(res.accounts)));
      } else if (apply) {
        toast.success(
          t("已修复 {n} 个不一致账户（按流水口径）").replace("{n}", String(res.repaired)),
        );
      } else {
        toast.warning(
          t("发现 {n} 个账户与流水不一致，合计偏差 ¥{amount} — 可点「修复账户」按流水对平")
            .replace("{n}", String(res.drifted.length))
            .replace("{amount}", res.drifted.reduce((s, d) => s + d.drift, 0).toFixed(2)),
        );
      }
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("对账校验失败"));
    } finally {
      setVerifying(false);
    }
  };

  const commission = (key: string) =>
    overview?.commissionByStatus?.[key] ?? { count: 0, amountCny: 0 };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("分销总览")}
        description={t(
          "团队规模、佣金三态与待提现概览；四个运维按钮都可重复执行：「立即对账」补归属/补佣金/按退款比例冲正，「结算到期佣金」在 CRON 关闭时兜底，「对账校验/修复账户」把账户余额与流水对平",
        )}
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {t("刷新")}
            </Button>
            <Button onClick={() => void reconcile()} disabled={reconciling}>
              <RefreshCw className={reconciling ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {t("立即对账")}
            </Button>
            <Button variant="outline" onClick={() => void settleManual()} disabled={settling}>
              <WalletCards className={settling ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {t("结算到期佣金")}
            </Button>
            <Button
              variant="outline"
              onClick={() => void verifyAccounts(false)}
              disabled={verifying}
            >
              <Scale className={verifying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {t("对账校验")}
            </Button>
            <Button
              variant="outline"
              onClick={() => void verifyAccounts(true)}
              disabled={verifying}
            >
              <Scale className="h-4 w-4" />
              {t("修复账户")}
            </Button>
          </>
        }
      />

      {/* 规模与待办 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !overview ? (
          Array.from({ length: 4 }, (_, i) => (
            <Card key={`sk-${i}`}>
              <CardContent className="p-4">
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              label={t("分销商")}
              value={overview?.distributors ?? 0}
              icon={Share2}
              tone="info"
            />
            <StatCard
              label={t("团队关系数")}
              hint={t("全站已建立的上下级关系条数")}
              value={overview?.teamMembers ?? 0}
              icon={Network}
            />
            <StatCard
              label={t("有效绑定数")}
              hint={t("客户当前仍归属某分销商")}
              value={overview?.binds ?? 0}
              icon={Link2}
            />
            <StatCard
              label={t("待处理提现")}
              hint={t("共 {n} 笔（待审核 + 已通过待打款）").replace(
                "{n}",
                String(overview?.pendingWithdraw.count ?? 0),
              )}
              value={formatCny(overview?.pendingWithdraw.amountCny ?? 0)}
              icon={Wallet}
              tone="warning"
            />
          </>
        )}
      </div>

      {/* 佣金三态：不套外层 Card，否则统计卡变「卡中卡」，层级视觉反而更乱 */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("佣金三态")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {loading && !overview
            ? Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={`csk-${i}`} className="h-20 w-full" />
              ))
            : COMMISSION_CARDS.map(({ key, label, icon, tone }) => {
                const item = commission(key);
                return (
                  <StatCard
                    key={key}
                    icon={icon}
                    tone={tone}
                    label={t(label).replace("{n}", String(item.count))}
                    hint={t(COMMISSION_STATUS_LABELS[key as keyof typeof COMMISSION_STATUS_LABELS])}
                    value={formatCny(item.amountCny)}
                  />
                );
              })}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "口径说明：三态是**同一条流水的状态**，不是三笔钱 —— 冲正不新增负向流水，而是把原流水置为 REVERSED（已结算过的会把已入账金额从可提现余额里扣回），因此「待结算 + 已结算」才等于 尚未被冲正的佣金；「团队关系数」是闭包表条数（含间接层级），远大于「有效绑定数」。",
        )}
      </p>
    </div>
  );
}

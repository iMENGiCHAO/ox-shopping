"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatMoney } from "@/lib/utils";
import type { CommissionState, WithdrawState } from "@/lib/distribution/contract";

/**
 * 分销后台的共享工具层。
 *
 * 为什么单独一份：7 个页面共用同一套状态文案与金额口径，散在各页会导致
 * 「同一个 PENDING 在总览叫待结算、在流水叫待处理」这类漂移；
 * 金额一律走 `formatMoney(x, "CNY")`（Intl 千分位），不在 JSX 里手拼 ¥。
 */

/* ─────────────────────────── 金额 / 时间 ─────────────────────────── */

/** 佣金、余额、提现一律折算成 CNY 记账（`COMMISSION_CURRENCY`），故符号固定 CNY */
export function formatCny(amount: number | null | undefined): string {
  return formatMoney(Number(amount ?? 0), "CNY");
}

/** 百分比展示：整数不补小数，小数保留两位（比例可配 0.5%） */
export function formatPercent(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

/* ─────────────────────────── 状态文案 ─────────────────────────── */

export const COMMISSION_STATUS_LABELS: Record<CommissionState, string> = {
  PENDING: "待结算",
  SETTLED: "已结算",
  REVERSED: "已冲正",
};

export const COMMISSION_STATUS_VARIANTS: Record<
  CommissionState,
  "warning" | "success" | "destructive"
> = {
  PENDING: "warning",
  SETTLED: "success",
  REVERSED: "destructive",
};

export const WITHDRAW_STATUS_LABELS: Record<WithdrawState, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  PAID: "已打款",
  REJECTED: "已驳回",
};

export const WITHDRAW_STATUS_VARIANTS: Record<
  WithdrawState,
  "warning" | "info" | "success" | "destructive"
> = {
  PENDING: "warning",
  APPROVED: "info",
  PAID: "success",
  REJECTED: "destructive",
};

export const WITHDRAW_STATUS_TABS: WithdrawState[] = ["PENDING", "APPROVED", "PAID", "REJECTED"];

/* ─────────────────────────── 统计卡 ─────────────────────────── */

const TONE_CLASS: Record<string, string> = {
  default: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONE_CLASS;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {Icon ? <Icon className={cn("h-8 w-8 shrink-0", TONE_CLASS[tone])} /> : null}
        <div className="min-w-0">
          <p className="truncate text-2xl font-semibold tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground" title={hint ?? label}>
            {label}
          </p>
          {hint ? <p className="truncate text-[11px] text-muted-foreground/70">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

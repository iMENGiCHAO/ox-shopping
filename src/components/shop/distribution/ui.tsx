"use client";

import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useT } from "@/components/shop/lang-provider";
import { commissionStatusLabel, withdrawStatusLabel } from "./format";

/**
 * 概览/账户的指标块：分销数字多，统一在这里收口字号与等宽数字。
 *
 * 样式（大爷 2026-09-20：「线条和框框太简单粗糙，要有流行的圆角」）：
 * `panel` 大圆角 + 柔和分层阴影（由 globals.css 的 `[data-dist-center]` 作用域提供），
 * 数字加大加粗，标签压小压灰 —— 现代面板的层次感一眼可读。
 */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="panel border border-border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[24px] font-semibold tabular-nums leading-none text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** 订单状态徽章：复用 StatusBadge 的默认配色，只把文案换成词典命中过的 t() */
export function OrderStatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <StatusBadge
      status={status}
      labelMap={{
        PENDING_PAYMENT: t("Payment pending"),
        PAID: t("Paid"),
        PROCESSING: t("Processing"),
        SHIPPED: t("Shipped"),
        DELIVERED: t("Delivered"),
        CANCELLED: t("Cancelled"),
        REFUNDED: t("Refunded"),
      }}
    />
  );
}

const COMMISSION_VARIANTS: Record<string, BadgeProps["variant"]> = {
  PENDING: "warning",
  SETTLED: "success",
  REVERSED: "destructive",
};

export function CommissionStatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <Badge variant={COMMISSION_VARIANTS[status] ?? "secondary"}>
      {commissionStatusLabel(t, status)}
    </Badge>
  );
}

const WITHDRAW_VARIANTS: Record<string, BadgeProps["variant"]> = {
  PENDING: "warning",
  APPROVED: "info",
  PAID: "success",
  REJECTED: "destructive",
};

export function WithdrawStatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <Badge variant={WITHDRAW_VARIANTS[status] ?? "secondary"}>
      {withdrawStatusLabel(t, status)}
    </Badge>
  );
}

/** 列表加载态：统一 3 行骨架，避免每个页面各写一套 */
export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

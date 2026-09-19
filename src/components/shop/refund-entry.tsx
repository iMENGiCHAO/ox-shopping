"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/shop/refund-dialog";
import { useT } from "@/components/shop/lang-provider";
import type { RefundStatus } from "@prisma/client";

export interface RefundEntryProps {
  orderNumber: string;
  total: number;
  /** Whether the current order status allows a refund request */
  refundable: boolean;
  /** 订单币种（用于金额展示） */
  currency?: string;
  /** 订单创建时的汇率快照 */
  exchangeRate?: number;
  /** 活跃退款状态（REQUESTED / APPROVED）；无活跃退款则为 null */
  activeRefundStatus?: RefundStatus | null;
  /** 游客订单的查询令牌（登录单为 null） */
  token?: string | null;
}

/** Refund entry (client): button + refund dialog；若有活跃退款则展示状态而非按钮 */
export function RefundEntry({
  orderNumber,
  total,
  refundable,
  currency,
  exchangeRate,
  activeRefundStatus,
  token,
}: RefundEntryProps) {
  const [open, setOpen] = useState(false);
  const t = useT();

  // 已有审核中/已通过的退款：显示状态，禁止重复申请
  if (activeRefundStatus === "REQUESTED" || activeRefundStatus === "APPROVED") {
    const label =
      activeRefundStatus === "REQUESTED" ? t("Refund under review") : t("Refund approved");
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {label}
      </div>
    );
  }

  if (!refundable) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {t("Request a refund")}
      </Button>
      <RefundDialog
        orderNumber={orderNumber}
        token={token}
        maxAmount={total}
        currency={currency}
        exchangeRate={exchangeRate}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
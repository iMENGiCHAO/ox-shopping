"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefundDialog } from "@/components/shop/refund-dialog";
import { useT } from "@/components/shop/lang-provider";

export interface RefundEntryProps {
  orderNumber: string;
  total: number;
  /** Whether the current order status allows a refund request */
  refundable: boolean;
}

/** Refund entry (client): button + refund dialog */
export function RefundEntry({ orderNumber, total, refundable }: RefundEntryProps) {
  const [open, setOpen] = useState(false);
  const t = useT();
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
        maxAmount={total}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

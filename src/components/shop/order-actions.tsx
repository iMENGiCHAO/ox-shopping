"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

export interface OrderActionsProps {
  orderNumber: string;
  status: string;
  className?: string;
}

/**
 * Order action buttons (client):
 * - PENDING_PAYMENT → pay now / cancel order
 * - SHIPPED → confirm receipt
 * After the action succeeds, router.refresh() re-renders the server-rendered page data.
 */
export function OrderActions({ orderNumber, status, className }: OrderActionsProps) {
  const router = useRouter();
  const t = useT();
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const run = async (action: string, fn: () => Promise<void>) => {
    setPendingAction(action);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Action failed, please try again later"));
    } finally {
      setPendingAction(null);
    }
  };

  const handlePay = () =>
    run("pay", async () => {
      const data = await apiFetch<{ paymentUrl: string }>(`/api/orders/${orderNumber}/pay`, {
        method: "POST",
      });
      if (data?.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        router.refresh();
      }
    });

  const handleCancel = () =>
    run("cancel", async () => {
      await apiFetch(`/api/orders/${orderNumber}/cancel`, { method: "POST" });
      toast.success(t("Order cancelled"));
      router.refresh();
    });

  const handleConfirmReceipt = () =>
    run("confirm", async () => {
      await apiFetch(`/api/orders/${orderNumber}/confirm-delivery`, { method: "POST" });
      toast.success(t("Receipt confirmed — thanks for your purchase!"));
      router.refresh();
    });

  return (
    <div className={className}>
      {status === "PENDING_PAYMENT" ? (
        <>
          <Button size="sm" disabled={pendingAction !== null} onClick={() => void handlePay()}>
            {pendingAction === "pay" ? t("Redirecting…") : t("Pay now")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pendingAction !== null}
            onClick={() => void handleCancel()}
          >
            {pendingAction === "cancel" ? t("Cancelling…") : t("Cancel order")}
          </Button>
        </>
      ) : null}
      {status === "SHIPPED" ? (
        <Button
          size="sm"
          disabled={pendingAction !== null}
          onClick={() => void handleConfirmReceipt()}
        >
          {pendingAction === "confirm" ? t("Processing…") : t("Confirm receipt")}
        </Button>
      ) : null}
    </div>
  );
}

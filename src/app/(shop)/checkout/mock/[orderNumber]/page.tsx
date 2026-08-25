"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

interface MockPayPageProps {
  params: { orderNumber: string };
}

/** Mock payment page (client): simulate success / cancel order */
export default function MockPayPage({ params }: MockPayPageProps) {
  const orderNumber = Array.isArray(params.orderNumber)
    ? params.orderNumber[0]
    : params.orderNumber;
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState<"pay" | "cancel" | null>(null);

  const handlePay = async () => {
    setPending("pay");
    try {
      await apiFetch(`/api/orders/${orderNumber}/mock-pay`, { method: "POST" });
      toast.success(t("Mock payment successful"));
      router.push(`/checkout/result?orderNumber=${encodeURIComponent(orderNumber)}&status=success`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Payment failed, please try again later"));
      setPending(null);
    }
  };

  const handleCancel = async () => {
    setPending("cancel");
    try {
      await apiFetch(`/api/orders/${orderNumber}/cancel`, { method: "POST" });
      toast.success(t("Order cancelled"));
      router.push(
        `/checkout/result?orderNumber=${encodeURIComponent(orderNumber)}&status=cancelled`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to cancel, please try again later"));
      setPending(null);
    }
  };

  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            {t("Mock payment")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("No real payment channel (Stripe) is configured — this is a demo mock payment flow. Clicking [Mock payment successful] will mark the order as paid.")}
          </p>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="text-muted-foreground">{t("Order pending payment")}</p>
            <p className="mt-0.5 font-mono font-semibold">{orderNumber}</p>
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" disabled={pending !== null} onClick={() => void handlePay()}>
              {pending === "pay" ? t("Processing…") : t("Mock payment successful")}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending !== null}
              onClick={() => void handleCancel()}
            >
              {pending === "cancel" ? t("Cancelling…") : t("Cancel order")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

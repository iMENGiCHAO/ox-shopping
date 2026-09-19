"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/fetch-client";
import { orderApiUrl } from "@/lib/order-api";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

export interface MockPayPanelProps {
  orderNumber: string;
  /** 游客订单的查询令牌（登录单为 null）；所有子接口调用都要带上 */
  token?: string | null;
}

/**
 * 模拟支付面板（客户端）：模拟成功 / 取消订单。
 *
 * 令牌透传：游客单没有账号，mock-pay / cancel 都靠 `?token=` 鉴权；
 * 回跳结果页时也要把令牌继续带上，否则结果页给不出可用的「查看订单」链接。
 */
export function MockPayPanel({ orderNumber, token }: MockPayPanelProps) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState<"pay" | "cancel" | null>(null);

  const resultUrl = (status: string) =>
    `/checkout/result?orderNumber=${encodeURIComponent(orderNumber)}&status=${status}${
      token ? `&token=${encodeURIComponent(token)}` : ""
    }`;

  const handlePay = async () => {
    setPending("pay");
    try {
      await apiFetch(orderApiUrl(orderNumber, token, "/mock-pay"), { method: "POST" });
      toast.success(t("Mock payment successful"));
      router.push(resultUrl("success"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Payment failed, please try again later"));
      setPending(null);
    }
  };

  const handleCancel = async () => {
    setPending("cancel");
    try {
      await apiFetch(orderApiUrl(orderNumber, token, "/cancel"), { method: "POST" });
      toast.success(t("Order cancelled"));
      router.push(resultUrl("cancelled"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Failed to cancel, please try again later"),
      );
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
          <p className="text-sm text-muted-foreground">{t("Mock payment notice")}</p>
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

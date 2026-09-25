"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/fetch-client";
import { orderApiUrl } from "@/lib/order-api";
import { toast } from "sonner";
import { useT, useShopLang } from "@/components/shop/lang-provider";
import { punct } from "@/lib/shop-i18n";
import { localizeErrorMessage } from "@/lib/error-i18n";

export interface OrderActionsProps {
  orderNumber: string;
  status: string;
  className?: string;
  /** 货到付款（COD）：无线上支付环节，未发货前随时可取消（现金交易无资金往来） */
  isCashOnDelivery?: boolean;
  /**
   * 游客订单的查询令牌（登录单为 null）。
   * 非空即表示「这是游客单」：所有子接口调用都要带上它，
   * 且隐藏「再次购买」（购物袋需要账号归属，游客无法加购）。
   */
  token?: string | null;
}

/**
 * Order action buttons (client):
 * - PENDING_PAYMENT → pay now / cancel order
 * - COD（货到付款）未发货 → cancel order（现金交易无支付按钮）
 * - SHIPPED → confirm receipt
 * - DELIVERED / CANCELLED / REFUNDED → reorder (再次购买 — 一键加购)
 * After the action succeeds, router.refresh() re-renders the server-rendered page data.
 */
export function OrderActions({
  orderNumber,
  status,
  className,
  isCashOnDelivery = false,
  token,
}: OrderActionsProps) {
  const router = useRouter();
  const t = useT();
  const { lang } = useShopLang();
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
      const data = await apiFetch<{ paymentUrl: string }>(orderApiUrl(orderNumber, token, "/pay"), {
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
      await apiFetch(orderApiUrl(orderNumber, token, "/cancel"), { method: "POST" });
      toast.success(t("Order cancelled"));
      router.refresh();
    });

  const handleConfirmReceipt = () =>
    run("confirm", async () => {
      await apiFetch(orderApiUrl(orderNumber, token, "/confirm-delivery"), { method: "POST" });
      toast.success(t("Receipt confirmed — thanks for your purchase!"));
      router.refresh();
    });

  const handleReorder = () =>
    run("reorder", async () => {
      const res = await apiFetch<{
        added: { name: string; quantity: number }[];
        skipped: { name: string; reason: string }[];
        addedCount: number;
        skippedCount: number;
      }>(orderApiUrl(orderNumber, token, "/reorder"), { method: "POST" });
      const added = res?.addedCount ?? 0;
      const skipped = res?.skippedCount ?? 0;
      if (added === 0 && skipped === 0) {
        toast.info(t("Order is empty"));
        return;
      }
      // 只要存在无库存/不可加购商品，就只展示警告。
      // 禁止同时弹出「已加入购物车」成功提示，避免让用户误以为售罄商品也进了购物车。
      if (skipped > 0) {
        const p = punct(lang);
        // 跳过原因是英文源串（服务端不写死中文，防英文站泄漏）——展示前按当前语言本地化
        const reasons = (res?.skipped ?? [])
          .slice(0, 3)
          .map((s) => `${s.name} (${localizeErrorMessage(s.reason, lang)})`)
          .join(p.list);
        toast.warning(
          `${t("{n} item(s) not added to cart", { n: skipped })}${p.colon}${reasons}${res && res.skipped.length > 3 ? "…" : ""}`,
        );
      } else if (added > 0) {
        toast.success(t("Added {n} item(s) to cart", { n: added }));
      }
      router.refresh();
    });

  return (
    <div className={className}>
      {status === "PENDING_PAYMENT" && !isCashOnDelivery ? (
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
      {/* COD（货到付款）：无支付按钮；未发货前（PENDING_PAYMENT=历史单 / PROCESSING=现行单）随时可取消 */}
      {isCashOnDelivery && (status === "PENDING_PAYMENT" || status === "PROCESSING") ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pendingAction !== null}
          onClick={() => void handleCancel()}
        >
          {pendingAction === "cancel" ? t("Cancelling…") : t("Cancel order")}
        </Button>
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
      {/* 游客单不支持一键再次购买：购物袋按 userId 归属，游客没有购物袋可加 */}
      {!token && (status === "DELIVERED" || status === "CANCELLED" || status === "REFUNDED") ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pendingAction !== null}
          onClick={() => void handleReorder()}
        >
          <Repeat className="h-3.5 w-3.5" />
          {pendingAction === "reorder" ? t("Adding…") : t("Reorder")}
        </Button>
      ) : null}
    </div>
  );
}

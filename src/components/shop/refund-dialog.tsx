"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { refundRequestSchema } from "@/lib/validations/cart-order";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/fetch-client";
import { orderApiUrl } from "@/lib/order-api";
import { toast } from "sonner";
import { formatAmount, parseCurrencyCode } from "@/components/shop/currency";

import { useShopLang } from "@/components/shop/lang-provider";
type RefundFormValues = { reason: string; amount: number };

export interface RefundDialogProps {
  orderNumber: string;
  /** 可申请退款的最大金额（订单实付，订单币种已换算金额，非 USD） */
  maxAmount: number;
  /** 订单币种（用于金额展示） */
  currency?: string;
  /** 订单创建时的汇率快照（仅审计/对账，已不参与显示换算） */
  exchangeRate?: number;
  /** 游客订单的查询令牌（登录单为 null） */
  token?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 申请退款对话框 */
export function RefundDialog({
  orderNumber,
  maxAmount,
  currency,
  token,
  open,
  onOpenChange,
}: RefundDialogProps) {
  const { t } = useShopLang();

  const router = useRouter();
  // 使用订单创建时的币种展示；maxAmount 已是订单币种金额（order.service 的 totalUser），
  // 绝不能再乘 exchangeRate——否则「订单 €100 显示 Max refund €85.72」二次换算 bug。
  const orderCurrency = parseCurrencyCode(currency ?? "USD");
  const formatOrder = (amount: number) => formatAmount(amount, orderCurrency);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundRequestSchema),
    defaultValues: { reason: "", amount: maxAmount },
  });

  const onSubmit = async (values: RefundFormValues) => {
    setSubmitting(true);
    try {
      await apiFetch(orderApiUrl(orderNumber, token, "/refund"), {
        method: "POST",
        body: JSON.stringify({ reason: values.reason.trim(), amount: values.amount }),
      });
      toast.success(t("Refund request submitted; we will review it as soon as possible"));
      form.reset({ reason: "", amount: maxAmount });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Failed to submit request, please try again later"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Request a refund")}</DialogTitle>
          <DialogDescription>
            {t("Max refund:")} {formatOrder(maxAmount)}.{" "}
            {t(
              "The refund will be returned through the original payment method once approved. If the order has been shipped, the items must be returned first.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Refund amount")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0.01}
                      max={maxAmount}
                      step="0.01"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Reason")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("Please describe the reason (at least 5 chars)")}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("Submitting…") : t("Submit request")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

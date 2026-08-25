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
import { toast } from "sonner";
import { useCurrency } from "@/components/shop/currency-provider";

import { useShopLang } from "@/components/shop/lang-provider";
type RefundFormValues = { reason: string; amount: number };

export interface RefundDialogProps {
  orderNumber: string;
  /** 可申请退款的最大金额(订单实付) */
  maxAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 申请退款对话框 */
export function RefundDialog({ orderNumber, maxAmount, open, onOpenChange }: RefundDialogProps) {
  const { t } = useShopLang();

  const router = useRouter();
  const { format } = useCurrency();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundRequestSchema),
    defaultValues: { reason: "", amount: maxAmount },
  });

  const onSubmit = async (values: RefundFormValues) => {
    setSubmitting(true);
    try {
      await apiFetch(`/api/orders/${orderNumber}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason: values.reason.trim(), amount: values.amount }),
      });
      toast.success(t("Refund request submitted; we will review it as soon as possible"));
      form.reset({ reason: "", amount: maxAmount });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request, please try again later");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a refund</DialogTitle>
          <DialogDescription>
            Max refund: {format(maxAmount)}
            . The refund will be returned through the original payment method once approved. If the order has been shipped, the items must be returned first.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Refund amount</FormLabel>
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
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Please describe the reason (at least 5 chars)" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

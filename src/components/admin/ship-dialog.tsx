"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { shipOrderSchema } from "@/lib/validations/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useT } from "@/components/admin/lang-provider";
type ShipFormValues = { trackingCompany: string; trackingNumber: string };

export interface ShipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  /** ship: ships and marks as shipped; edit: fill/update shipping info without changing status */
  mode?: "ship" | "edit";
  /** initial shipping info in edit mode */
  initial?: { trackingCompany?: string | null; trackingNumber?: string | null };
  /** called on ship / save success */
  onSaved?: (tracking?: { trackingCompany: string; trackingNumber: string }) => void;
}

/** Order ship / edit shipping info dialog */
export function ShipDialog({
  open,
  onOpenChange,
  orderId,
  mode = "ship",
  initial,
  onSaved,
}: ShipDialogProps) {
  const t = useT();

  const [loading, setLoading] = React.useState(false);
  const isEdit = mode === "edit";

  const form = useForm<ShipFormValues>({
    resolver: zodResolver(shipOrderSchema),
    defaultValues: { trackingCompany: "", trackingNumber: "" },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        trackingCompany: initial?.trackingCompany ?? "",
        trackingNumber: initial?.trackingNumber ?? "",
      });
    }
  }, [open, initial, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!orderId) return;
    setLoading(true);
    try {
      if (isEdit) {
        await apiFetch(`/api/admin/orders/${orderId}/tracking`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        toast.success(t("Shipping info saved"));
      } else {
        await apiFetch(`/api/admin/orders/${orderId}/ship`, {
          method: "POST",
          body: JSON.stringify(values),
        });
        toast.success(t("Shipped successfully"));
      }
      onOpenChange(false);
      onSaved?.(values);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEdit ? "保存物流信息失败" : "发货失败");
    } finally {
      setLoading(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "修改物流信息" : t("Ship Order")}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "填写或更正该订单的承运商与物流单号。"
              : "填入物流信息后，订单将标记为「已发货」。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" aria-label="发货录入">
          <div className="space-y-2">
            <Label htmlFor="ship-company">{t("Carrier")} *</Label>
            <Input
              id="ship-company"
              placeholder="例如 顺丰 / 圆通 / 中通"
              {...form.register("trackingCompany")}
            />
            {form.formState.errors.trackingCompany ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.trackingCompany.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ship-number">{t("Tracking Number")} *</Label>
            <Input
              id="ship-number"
              placeholder={t("Enter the tracking number")}
              {...form.register("trackingNumber")}
            />
            {form.formState.errors.trackingNumber ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.trackingNumber.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {isEdit ? "保存物流信息" : "确认发货"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

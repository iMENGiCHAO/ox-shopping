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
      toast.error(err instanceof Error ? err.message : isEdit ? "Failed to save shipping info" : "Failed to ship");
    } finally {
      setLoading(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit shipping info" : "Ship order"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Fill or correct the carrier and tracking number for this order."
              : 'After entering shipping info, the order will be marked as "Shipped".'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ship-company">Carrier *</Label>
            <Input
              id="ship-company"
              placeholder="e.g. SF Express / YTO Express / ZTO Express"
              {...form.register("trackingCompany")}
            />
            {form.formState.errors.trackingCompany ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.trackingCompany.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ship-number">Tracking # *</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {isEdit ? "Save shipping info" : "Confirm ship"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

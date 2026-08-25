"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { addressSchema, type AddressInput } from "@/lib/validations/address";
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
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import type { ShopAddress } from "@/components/shop/types";
import { useT } from "@/components/shop/lang-provider";

export interface AddressFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass in to edit (PUT); omit to create (POST) */
  initial?: ShopAddress | null;
  onSaved?: () => void;
}

/** Shipping address form (used for both add/edit, in a Dialog) */
export function AddressForm({ open, onOpenChange, initial, onSaved }: AddressFormProps) {
  const isEdit = !!initial;
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      recipientName: initial?.recipientName ?? "",
      phone: initial?.phone ?? "",
      province: initial?.province ?? "",
      city: initial?.city ?? "",
      district: initial?.district ?? "",
      detail: initial?.detail ?? "",
      isDefault: initial?.isDefault ?? false,
    },
  });

  const onSubmit = async (values: AddressInput) => {
    setSubmitting(true);
    try {
      if (isEdit && initial) {
        await apiFetch(`/api/user/addresses/${initial.id}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        toast.success(t("Address updated"));
      } else {
        await apiFetch("/api/user/addresses", {
          method: "POST",
          body: JSON.stringify(values),
        });
        toast.success(t("Address added"));
      }
      form.reset();
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Edit shipping address") : t("Add a shipping address")}</DialogTitle>
          <DialogDescription>{t("Please fill in accurate contact and shipping details.")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="recipientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Recipient")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("Name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Phone")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("11-digit phone")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="province"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Province")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("Province")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("City")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("City")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="district"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("District / County")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("District / County")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="detail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Address")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("Street address (at least 5 characters)")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <FormLabel className="mb-0">{t("Set as default address")}</FormLabel>
                    <p className="text-xs text-muted-foreground">{t("This address will be the default at checkout")}</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("Saving…") : t("Save address")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

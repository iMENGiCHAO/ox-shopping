"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminCoupon, AdminCouponType, AdminListResult } from "@/components/admin/types";

import { useT } from "@/components/admin/lang-provider";
/** ISO time → datetime-local input value (local timezone) */
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COUPON_TYPE_LABELS: Record<AdminCouponType, string> = {
  PERCENTAGE: "Percentage off",
  FIXED: "Fixed amount",
  FREE_SHIPPING: "Free shipping",
};

const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Coupon code must be at least 3 characters")
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "Code may only contain letters, digits, underscores and hyphens")
      .transform((v) => v.toUpperCase()),
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    value: z.string().min(1, "Please enter a discount value"),
    minSpend: z.string().min(1, "Please enter a minimum spend"),
    maxDiscount: z.string().optional().or(z.literal("")),
    startsAt: z.string().min(1, "Please select a start time"),
    endsAt: z.string().min(1, "Please select an end time"),
    usageLimit: z.string().min(1, "Please enter a usage limit"),
    isActive: z.boolean().default(true),
  })
  .refine(
    (d) =>
      !d.startsAt || !d.endsAt || new Date(d.endsAt).getTime() > new Date(d.startsAt).getTime(),
    { message: "End time must be after start time", path: ["endsAt"] },
  )
  .refine((d) => Number.isFinite(Number(d.value)) && Number(d.value) >= 0, {
    message: "Coupon value must be a number >= 0",
    path: ["value"],
  })
  .refine((d) => Number(d.value) <= 10000, {
    message: "Coupon value cannot exceed 10000",
    path: ["value"],
  })
  .refine((d) => d.type !== "PERCENTAGE" || Number(d.value) <= 100, {
    message: "Percentage cannot exceed 100",
    path: ["value"],
  })
  .refine((d) => Number.isFinite(Number(d.minSpend)) && Number(d.minSpend) >= 0, {
    message: "Minimum spend must be a number >= 0",
    path: ["minSpend"],
  })
  .refine(
    (d) => !d.maxDiscount || (Number.isFinite(Number(d.maxDiscount)) && Number(d.maxDiscount) >= 0),
    { message: "Max discount must be a number >= 0", path: ["maxDiscount"] },
  )
  .refine((d) => Number.isInteger(Number(d.usageLimit)) && Number(d.usageLimit) >= 0, {
    message: "Usage limit must be a non-negative integer",
    path: ["usageLimit"],
  });

type CouponFormValues = z.infer<typeof couponFormSchema>;

const PAGE_SIZE = 10;

export default function AdminCouponsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminCoupon[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminCoupon | null>(null);
  const [formSaving, setFormSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminCoupon | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toggleId, setToggleId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<AdminCoupon>>(
        `/api/admin/coupons?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load coupons");
    } finally {
      setLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      type: "PERCENTAGE",
      value: "",
      minSpend: "",
      maxDiscount: "",
      startsAt: "",
      endsAt: "",
      usageLimit: "0",
      isActive: true,
    },
  });

  React.useEffect(() => {
    if (!formOpen) return;
    form.reset({
      code: editing?.code ?? "",
      type: editing?.type ?? "PERCENTAGE",
      value: editing ? String(Number(editing.value)) : "",
      minSpend: editing ? String(Number(editing.minSpend)) : "",
      maxDiscount: editing?.maxDiscount != null ? String(Number(editing.maxDiscount)) : "",
      startsAt: editing ? toLocalDatetimeInput(editing.startsAt) : "",
      endsAt: editing ? toLocalDatetimeInput(editing.endsAt) : "",
      usageLimit: editing ? String(editing.usageLimit) : "0",
      isActive: editing?.isActive ?? true,
    });
  }, [formOpen, editing, form]);

  const watchedType = form.watch("type");

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setFormSaving(true);
    const payload = {
      code: values.code,
      type: values.type,
      value: values.type === "FREE_SHIPPING" ? 0 : Number(values.value),
      minSpend: Number(values.minSpend),
      maxDiscount: values.maxDiscount ? Number(values.maxDiscount) : null,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      usageLimit: Number(values.usageLimit),
      isActive: values.isActive,
    };
    try {
      if (editing) {
        await apiFetch(`/api/admin/coupons/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success(t("Coupon updated"));
      } else {
        await apiFetch("/api/admin/coupons", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(t("Coupon created"));
      }
      setFormOpen(false);
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save coupon");
    } finally {
      setFormSaving(false);
    }
  });

  const toggleActive = async (coupon: AdminCoupon, isActive: boolean) => {
    setToggleId(coupon.id);
    try {
      await apiFetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      toast.success(isActive ? "Coupon activated" : "Coupon disabled");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update coupon status");
    } finally {
      setToggleId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/admin/coupons/${deleting.id}`, { method: "DELETE" });
      toast.success(t("Coupon deleted"));
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete coupon");
    } finally {
      setDeleteLoading(false);
    }
  };

  /** Type display text */
  const typeLabel = (c: AdminCoupon) => {
    if (c.type === "PERCENTAGE") return `${Number(c.value)}%  off`;
    if (c.type === "FIXED") return `Fixed  ${formatMoney(c.value)}`;
    return "Free shipping";
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Coupons")}
        description={t("Create and manage promotional coupons")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Coupon
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Min spend</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Used / Limit</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="w-36 text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={<Ticket className="h-6 w-6" />}
                      title={t("No coupons yet")}
                      description='Click "New Coupon" to create your first coupon'
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono text-sm font-semibold">{coupon.code}</TableCell>
                    <TableCell>
                      <div className="text-sm">{typeLabel(coupon)}</div>
                      <div className="text-xs text-muted-foreground">
                        {coupon.type === "PERCENTAGE" && coupon.maxDiscount != null
                          ? `Max off ${formatMoney(coupon.maxDiscount)}`
                          : COUPON_TYPE_LABELS[coupon.type]}
                      </div>
                    </TableCell>
                    <TableCell>Min spend {formatMoney(coupon.minSpend)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>{new Date(coupon.startsAt).toLocaleString("zh-CN")}</div>
                      <div>to {new Date(coupon.endsAt).toLocaleString("zh-CN")}</div>
                    </TableCell>
                    <TableCell>
                      {coupon.usedCount} / {coupon.usageLimit === 0 ? "unlimited" : coupon.usageLimit}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={coupon.isActive}
                        disabled={toggleId === coupon.id}
                        onCheckedChange={(v) => void toggleActive(coupon, v)}
                        aria-label={`toggle ${coupon.code} Status`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => {
                            setEditing(coupon);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(coupon)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-end"
      />

      {/* create/edit dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(v) => {
          if (!formSaving) {
            setFormOpen(v);
            if (!v) setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Coupon" : "New Coupon"}</DialogTitle>
            <DialogDescription>
              {editing ? `Editing: ${editing.code}` : "Create a new promotional coupon"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cp-code">Code *</Label>
                <Input
                  id="cp-code"
                  placeholder="e.g. SUMMER50 (auto uppercased)"
                  {...form.register("code")}
                />
                {form.formState.errors.code ? (
                  <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select
                  value={watchedType}
                  onValueChange={(v) => form.setValue("type", v as AdminCouponType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">Percentage off</SelectItem>
                    <SelectItem value="FIXED">Fixed amount</SelectItem>
                    <SelectItem value="FREE_SHIPPING">Free shipping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-value">
                  Coupon value *
                  {watchedType === "PERCENTAGE"
                    ? "(%)"
                    : watchedType === "FIXED"
                      ? "(amount)"
                      : "(not required for free shipping)"}
                </Label>
                <Input
                  id="cp-value"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={watchedType === "PERCENTAGE" ? "e.g. 90 = 10% off" : "0"}
                  disabled={watchedType === "FREE_SHIPPING"}
                  {...form.register("value")}
                />
                {form.formState.errors.value ? (
                  <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-min">Min spend (minimum order amount) *</Label>
                <Input
                  id="cp-min"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0 = no minimum"
                  {...form.register("minSpend")}
                />
                {form.formState.errors.minSpend ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.minSpend.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-max">Max discount (amount, optional)</Label>
                <Input
                  id="cp-max"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="leave empty for no cap"
                  {...form.register("maxDiscount")}
                />
                {form.formState.errors.maxDiscount ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.maxDiscount.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-limit">Usage limit (0 = unlimited) *</Label>
                <Input
                  id="cp-limit"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...form.register("usageLimit")}
                />
                {form.formState.errors.usageLimit ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.usageLimit.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-start">Start time *</Label>
                <Input id="cp-start" type="datetime-local" {...form.register("startsAt")} />
                {form.formState.errors.startsAt ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.startsAt.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-end">End time *</Label>
                <Input id="cp-end" type="datetime-local" {...form.register("endsAt")} />
                {form.formState.errors.endsAt ? (
                  <p className="text-xs text-destructive">{form.formState.errors.endsAt.message}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="cp-active"
                checked={form.watch("isActive")}
                onCheckedChange={(v) => form.setValue("isActive", v)}
              />
              <Label htmlFor="cp-active" className="cursor-pointer">
                Activate immediately after creation
              </Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={formSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={formSaving}>
                {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create coupon"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !deleteLoading && setDeleting(v ? deleting : null)}
        title={t("Delete coupon")}
        description={deleting ? `Are you sure you want to delete coupon"${deleting.code}"? This action cannot be undone.` : ""}
        confirmText="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

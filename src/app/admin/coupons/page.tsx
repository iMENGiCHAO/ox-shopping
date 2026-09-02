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
import { DataTableActions } from "@/components/admin/data-table-actions";
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
import { CellText, CellPair, CellStack } from "@/components/admin/cell-text";

import { useT } from "@/components/admin/lang-provider";
/** ISO time → datetime-local input value (local timezone) */
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COUPON_TYPE_LABELS: Record<AdminCouponType, string> = {
  PERCENTAGE: "百分比折扣",
  FIXED: "固定金额",
  FREE_SHIPPING: "免邮",
};

const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "兑换码至少 3 个字符")
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "兑换码只能包含字母、数字、下划线与连字符")
      .transform((v) => v.toUpperCase()),
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    value: z.string().min(1, "请填写折扣值"),
    minSpend: z.string().min(1, "请填写最低消费"),
    maxDiscount: z.string().optional().or(z.literal("")),
    startsAt: z.string().min(1, "请选择开始时间"),
    endsAt: z.string().min(1, "请选择结束时间"),
    usageLimit: z.string().min(1, "请填写使用上限"),
    isActive: z.boolean().default(true),
  })
  .refine(
    (d) =>
      !d.startsAt || !d.endsAt || new Date(d.endsAt).getTime() > new Date(d.startsAt).getTime(),
    { message: "结束时间必须晚于开始时间", path: ["endsAt"] },
  )
  .refine((d) => Number.isFinite(Number(d.value)) && Number(d.value) >= 0, {
    message: "折扣值必须为大于等于 0 的数字",
    path: ["value"],
  })
  .refine((d) => Number(d.value) <= 10000, {
    message: "折扣值不能超过 10000",
    path: ["value"],
  })
  .refine((d) => d.type !== "PERCENTAGE" || Number(d.value) <= 100, {
    message: "百分比折扣不能超过 100",
    path: ["value"],
  })
  .refine((d) => Number.isFinite(Number(d.minSpend)) && Number(d.minSpend) >= 0, {
    message: "最低消费必须为大于等于 0 的数字",
    path: ["minSpend"],
  })
  .refine(
    (d) => !d.maxDiscount || (Number.isFinite(Number(d.maxDiscount)) && Number(d.maxDiscount) >= 0),
    { message: "最大折扣必须为大于等于 0 的数字", path: ["maxDiscount"] },
  )
  .refine((d) => Number.isInteger(Number(d.usageLimit)) && Number(d.usageLimit) >= 0, {
    message: "使用上限必须为非负整数",
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
      toast.error(err instanceof Error ? err.message : "加载优惠券失败");
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
      toast.error(err instanceof Error ? err.message : "保存优惠券失败");
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
      toast.success(isActive ? "已启用优惠券" : "已停用优惠券");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新优惠券状态失败");
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
      toast.error(err instanceof Error ? err.message : "删除优惠券失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  /** 类型展示文本 */
  const typeLabel = (c: AdminCoupon) => {
    if (c.type === "PERCENTAGE") return `${Number(c.value)}% 折扣`;
    if (c.type === "FIXED") return `立减 ${formatMoney(c.value)}`;
    return "免邮";
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
            {t("New Coupon")}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">{t("Code")}</TableHead>
                <TableHead className="min-w-0">{t("Discount Type")}</TableHead>
                <TableHead className="w-24">最低消费</TableHead>
                <TableHead className="w-[140px]">有效期</TableHead>
                <TableHead className="w-24">{t("Used Count")} / {t("Usage Limit")}</TableHead>
                <TableHead className="w-24">{t("Status")}</TableHead>
                <TableHead className="sticky-col-right w-[110px] text-right">
                  {t("Actions")}
                </TableHead>
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
                      description='点击"新增优惠券"来创建你的第一张优惠券'
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <CellText
                        value={coupon.code}
                        className="font-mono text-sm font-semibold"
                      />
                    </TableCell>
                    <TableCell>
                      <CellPair
                        primary={typeLabel(coupon)}
                        secondary={
                          coupon.type === "PERCENTAGE" && coupon.maxDiscount != null
                            ? `最高减 ${formatMoney(coupon.maxDiscount)}`
                            : COUPON_TYPE_LABELS[coupon.type]
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellText value={`最低消费 ${formatMoney(coupon.minSpend)}`} />
                    </TableCell>
                    <TableCell>
                      <CellStack className="text-xs tabular-nums text-muted-foreground">
                        <span className="truncate">
                          {new Date(coupon.startsAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="truncate">
                          至 {new Date(coupon.endsAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </CellStack>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {coupon.usedCount} / {coupon.usageLimit === 0 ? "不限" : coupon.usageLimit}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={coupon.isActive}
                        disabled={toggleId === coupon.id}
                        onCheckedChange={(v) => void toggleActive(coupon, v)}
                        aria-label={`切换 ${coupon.code} 的状态`}
                      />
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <DataTableActions
                        actions={[
                          {
                            label: t("Edit"),
                            icon: Pencil,
                            onClick: () => {
                              setEditing(coupon);
                              setFormOpen(true);
                            },
                            primary: true,
                          },
                          {
                            label: t("Delete"),
                            icon: Trash2,
                            onClick: () => setDeleting(coupon),
                            destructive: true,
                            divider: true,
                          },
                        ]}
                      />
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
            <DialogTitle>{editing ? t("Edit Coupon") : t("New Coupon")}</DialogTitle>
            <DialogDescription>
              {editing ? `正在编辑：${editing.code}` : "创建新的促销优惠券"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cp-code">{t("Code")} *</Label>
                <Input
                  id="cp-code"
                  placeholder="例如 SUMMER50（自动转大写）"
                  {...form.register("code")}
                />
                {form.formState.errors.code ? (
                  <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>{t("Discount Type")} *</Label>
                <Select
                  value={watchedType}
                  onValueChange={(v) => form.setValue("type", v as AdminCouponType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">百分比折扣</SelectItem>
                    <SelectItem value="FIXED">固定金额</SelectItem>
                    <SelectItem value="FREE_SHIPPING">免邮</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-value">
                  {t("Discount Value")} *
                  {watchedType === "PERCENTAGE"
                    ? "（百分比）"
                    : watchedType === "FIXED"
                      ? "（金额）"
                      : "（免邮券无需填写）"}
                </Label>
                <Input
                  id="cp-value"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={watchedType === "PERCENTAGE" ? "例如 90 = 9 折" : "0"}
                  disabled={watchedType === "FREE_SHIPPING"}
                  {...form.register("value")}
                />
                {form.formState.errors.value ? (
                  <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-min">{t("Min Order Amount")} *</Label>
                <Input
                  id="cp-min"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0 = 无门槛"
                  {...form.register("minSpend")}
                />
                {form.formState.errors.minSpend ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.minSpend.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-max">最大折扣（金额，可选）</Label>
                <Input
                  id="cp-max"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="留空则不设上限"
                  {...form.register("maxDiscount")}
                />
                {form.formState.errors.maxDiscount ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.maxDiscount.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-limit">{t("Usage Limit")}（0 = 不限）*</Label>
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
                <Label htmlFor="cp-start">{t("Valid From")} *</Label>
                <Input id="cp-start" type="datetime-local" {...form.register("startsAt")} />
                {form.formState.errors.startsAt ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.startsAt.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-end">{t("Valid Until")} *</Label>
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
                创建后立即启用
              </Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={formSaving}
              >
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={formSaving}>
                {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editing ? t("Save changes") : "创建优惠券"}
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
        description={deleting ? `确定要删除兑换码"${deleting.code}"吗？此操作无法撤销。` : ""}
        confirmText={t("Delete")}
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

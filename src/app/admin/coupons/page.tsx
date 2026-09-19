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

/* ────────────────────────────────────────────────────────────────────────────
 * 折扣码管理（/admin/coupons）
 *
 * 金额口径：value / minSpend / maxDiscount 一律是**基础币种 USD**，
 * 与 coupon.service 的结算计算同源。后台不做币种换算——否则会出现
 * 「按 EUR 录券、USD 站结算」的跨币种错账。
 *
 * 文案口径：zod 校验消息写成「英文源串」，渲染时经 t() 取词典，
 * 保证校验提示与全站 i18n 一致，且不出现硬编码中文。
 * ──────────────────────────────────────────────────────────────────────────── */

/** ISO 时间 → datetime-local 输入值（本地时区） */
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Coupon code is required")
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, "Coupon code is required")
      .transform((v) => v.toUpperCase()),
    type: z.enum(["PERCENTAGE", "FIXED", "FREE_SHIPPING"]),
    value: z.string(),
    minSpend: z.string().min(1, "Minimum spend is required"),
    maxDiscount: z.string(),
    perUserLimit: z.string(),
    usageLimit: z.string(),
    startsAt: z.string().min(1, "Start time is required"),
    endsAt: z.string().min(1, "End time is required"),
    isPublic: z.boolean(),
    title: z.string(),
    titleEn: z.string(),
    description: z.string(),
    descriptionEn: z.string(),
    isActive: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const add = (path: keyof typeof d, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (new Date(d.endsAt).getTime() <= new Date(d.startsAt).getTime()) {
      add("endsAt", "End time must be later than start time");
    }

    const value = Number(d.value);
    if (d.type === "PERCENTAGE") {
      if (!Number.isFinite(value) || value <= 0 || value > 100) {
        add("value", "Percentage must be between 1 and 100");
      }
    } else if (d.type === "FIXED") {
      if (!Number.isFinite(value) || value <= 0) {
        add("value", "Fixed amount must be greater than 0");
      }
    }

    if (!Number.isFinite(Number(d.minSpend)) || Number(d.minSpend) < 0) {
      add("minSpend", "Minimum spend is required");
    }

    if (d.maxDiscount && Number(d.maxDiscount) <= 0) {
      add("maxDiscount", "Cap must be greater than 0");
    }

    const limit = Number(d.usageLimit);
    if (!Number.isInteger(limit) || limit < 0) {
      add("usageLimit", "Usage limit must be a non-negative integer");
    }

    const perUser = Number(d.perUserLimit);
    if (!Number.isInteger(perUser) || perUser < 0) {
      add("perUserLimit", "Per-user limit must be a non-negative integer");
    }

    // 公开露出却没有文案 → 领券页出现空白卡片，拦在录入阶段
    if (d.isPublic && !d.title.trim() && !d.titleEn.trim()) {
      add("title", "Public coupons need a title");
    }
  });

type CouponFormValues = z.infer<typeof couponFormSchema>;

const PAGE_SIZE = 10;

const TYPE_LABEL_KEY: Record<AdminCouponType, string> = {
  PERCENTAGE: "Percentage",
  FIXED: "Fixed amount",
  FREE_SHIPPING: "Free shipping",
};

export default function AdminCouponsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminCoupon[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [query, setQuery] = React.useState("");
  /** 已提交的搜索词（与输入框分离，避免每次按键都打接口） */
  const [appliedQuery, setAppliedQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminCoupon | null>(null);
  const [formSaving, setFormSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminCoupon | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toggleId, setToggleId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (appliedQuery) qs.set("q", appliedQuery);
      if (status !== "all") qs.set("status", status);
      const res = await apiFetchRaw<AdminListResult<AdminCoupon>>(`/api/admin/coupons?${qs}`);
      setRows(res.data ?? []);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load coupons"));
    } finally {
      setLoading(false);
    }
  }, [page, appliedQuery, status, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      type: "PERCENTAGE",
      value: "",
      minSpend: "0",
      maxDiscount: "",
      perUserLimit: "1",
      usageLimit: "0",
      startsAt: "",
      endsAt: "",
      isPublic: false,
      title: "",
      titleEn: "",
      description: "",
      descriptionEn: "",
      isActive: true,
    },
  });

  React.useEffect(() => {
    if (!formOpen) return;
    form.reset({
      code: editing?.code ?? "",
      type: editing?.type ?? "PERCENTAGE",
      value: editing ? String(editing.value) : "",
      minSpend: editing ? String(editing.minSpend) : "0",
      maxDiscount: editing?.maxDiscount != null ? String(editing.maxDiscount) : "",
      perUserLimit: editing ? String(editing.perUserLimit) : "1",
      usageLimit: editing ? String(editing.usageLimit) : "0",
      startsAt: editing ? toLocalDatetimeInput(editing.startsAt) : "",
      endsAt: editing ? toLocalDatetimeInput(editing.endsAt) : "",
      isPublic: editing?.isPublic ?? false,
      title: editing?.title ?? "",
      titleEn: editing?.titleEn ?? "",
      description: editing?.description ?? "",
      descriptionEn: editing?.descriptionEn ?? "",
      isActive: editing?.isActive ?? true,
    });
  }, [formOpen, editing, form]);

  const watchedType = form.watch("type");
  const watchedPublic = form.watch("isPublic");

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setFormSaving(true);
    const payload = {
      code: values.code,
      type: values.type,
      // 免邮券的 value 无意义，统一传 0（服务端亦会归零，双保险）
      value: values.type === "FREE_SHIPPING" ? 0 : Number(values.value),
      minSpend: Number(values.minSpend),
      maxDiscount: values.maxDiscount ? Number(values.maxDiscount) : null,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      usageLimit: Number(values.usageLimit),
      perUserLimit: Number(values.perUserLimit),
      isPublic: values.isPublic,
      title: values.title.trim() || null,
      titleEn: values.titleEn.trim() || null,
      description: values.description.trim() || null,
      descriptionEn: values.descriptionEn.trim() || null,
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
      toast.error(err instanceof Error ? err.message : t("Failed to save coupon"));
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
      toast.success(isActive ? t("Coupon enabled") : t("Coupon disabled"));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to update coupon status"));
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
      toast.error(err instanceof Error ? err.message : t("Failed to delete coupon"));
    } finally {
      setDeleteLoading(false);
    }
  };

  /** 折扣卖点文案（金额走 formatMoney，币种为后台基础币种，不硬编码货币符号） */
  const typeLabel = (c: AdminCoupon) => {
    if (c.type === "PERCENTAGE") return `${c.value}%`;
    if (c.type === "FIXED") return formatMoney(c.value);
    return t("Free shipping");
  };

  const fieldError = (name: keyof CouponFormValues) => {
    const message = form.formState.errors[name]?.message;
    return message ? <p className="text-xs text-destructive">{t(String(message))}</p> : null;
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Coupons")}
        description={t("Create and manage discount codes")}
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

      {/* 筛选条 */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setAppliedQuery(query.trim());
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search coupon code")}
            className="h-9"
          />
          <Button type="submit" variant="outline" className="h-9 shrink-0">
            {t("Search")}
          </Button>
        </form>
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All statuses")}</SelectItem>
            <SelectItem value="active">{t("Active")}</SelectItem>
            <SelectItem value="inactive">{t("Inactive")}</SelectItem>
            <SelectItem value="expired">{t("Expired")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {/*
            Table 组件是 `table-fixed`：列宽取自首行，总宽超出容器时**按比例压缩**，
            `min-w-*` 写在 <th> 上不生效（会被压成「折…」）。故把最小宽度给到 <table> 自身，
            由组件的 overflow-x-auto 容器横向滚动。
            列宽合计 150+176+100+164+134+72+104 = 900，正好贴合 1280 视口下的容器宽（910），
            更宽视口多出的空间按比例摊给各列。
          */}
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">{t("Code")}</TableHead>
                <TableHead className="w-[176px]">{t("Discount Type")}</TableHead>
                <TableHead className="w-[100px]">{t("Min Order Amount")}</TableHead>
                <TableHead className="w-[164px]">{t("Valid From")}</TableHead>
                <TableHead className="w-[134px]">
                  {t("Used Count")} / {t("Limit")}
                </TableHead>
                <TableHead className="w-[72px]">{t("Status")}</TableHead>
                <TableHead className="sticky-col-right w-[104px] text-right">
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
                      description={t("Create and manage discount codes")}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <CellPair
                        primary={coupon.code}
                        secondary={coupon.isPublic ? t("Public") : undefined}
                        className="font-mono text-sm font-semibold"
                      />
                    </TableCell>
                    <TableCell>
                      <CellPair
                        primary={typeLabel(coupon)}
                        secondary={
                          coupon.type === "PERCENTAGE" && coupon.maxDiscount != null
                            ? `${t("Max discount")} ${formatMoney(coupon.maxDiscount)}`
                            : t(TYPE_LABEL_KEY[coupon.type])
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <CellText
                        value={coupon.minSpend > 0 ? formatMoney(coupon.minSpend) : t("Unlimited")}
                      />
                    </TableCell>
                    <TableCell>
                      <CellStack className="text-xs tabular-nums text-muted-foreground">
                        <span className="truncate">
                          {new Date(coupon.startsAt).toLocaleString()}
                        </span>
                        <span className="truncate">{new Date(coupon.endsAt).toLocaleString()}</span>
                      </CellStack>
                    </TableCell>
                    <TableCell>
                      <CellPair
                        primary={`${coupon.usedCount} / ${
                          coupon.usageLimit === 0 ? t("Unlimited") : coupon.usageLimit
                        }`}
                        secondary={`${t("Per-user limit")} ${
                          coupon.perUserLimit === 0 ? t("Unlimited") : coupon.perUserLimit
                        }`}
                        className="tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={coupon.isActive}
                        disabled={toggleId === coupon.id}
                        onCheckedChange={(v) => void toggleActive(coupon, v)}
                        aria-label={coupon.code}
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

      {/* 新建 / 编辑 */}
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
            <DialogDescription>{editing ? editing.code : t("Coupons")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cp-code">{t("Code")} *</Label>
                <Input id="cp-code" placeholder="SUMMER20" {...form.register("code")} />
                {fieldError("code")}
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
                    <SelectItem value="PERCENTAGE">{t("Percentage")}</SelectItem>
                    <SelectItem value="FIXED">{t("Fixed amount")}</SelectItem>
                    <SelectItem value="FREE_SHIPPING">{t("Free shipping")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-value">{t("Discount Value")} *</Label>
                <Input
                  id="cp-value"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={watchedType === "PERCENTAGE" ? "20" : "10"}
                  disabled={watchedType === "FREE_SHIPPING"}
                  {...form.register("value")}
                />
                {fieldError("value")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-min">{t("Min Order Amount")} *</Label>
                <Input
                  id="cp-min"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  {...form.register("minSpend")}
                />
                {fieldError("minSpend")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-max">{t("Max discount")}</Label>
                <Input
                  id="cp-max"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={watchedType !== "PERCENTAGE"}
                  {...form.register("maxDiscount")}
                />
                {fieldError("maxDiscount")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-usage">{t("Usage Limit")}</Label>
                <Input
                  id="cp-usage"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...form.register("usageLimit")}
                />
                {fieldError("usageLimit")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-peruser">{t("Per-user limit")}</Label>
                <Input
                  id="cp-peruser"
                  type="number"
                  min="0"
                  placeholder="1"
                  {...form.register("perUserLimit")}
                />
                {fieldError("perUserLimit")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-start">{t("Valid From")} *</Label>
                <Input id="cp-start" type="datetime-local" {...form.register("startsAt")} />
                {fieldError("startsAt")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cp-end">{t("Valid Until")} *</Label>
                <Input id="cp-end" type="datetime-local" {...form.register("endsAt")} />
                {fieldError("endsAt")}
              </div>
            </div>

            {/* 公开领券中心展示文案 */}
            <div className="space-y-4 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="cp-public"
                  checked={watchedPublic}
                  onCheckedChange={(v) => form.setValue("isPublic", v)}
                />
                <Label htmlFor="cp-public" className="cursor-pointer">
                  {t("Show on coupon center")}
                </Label>
              </div>
              {watchedPublic ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cp-title">{t("Coupon title (Chinese)")}</Label>
                    <Input id="cp-title" {...form.register("title")} />
                    {fieldError("title")}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cp-title-en">{t("Coupon title (English)")}</Label>
                    <Input id="cp-title-en" {...form.register("titleEn")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cp-desc">{t("Coupon description (Chinese)")}</Label>
                    <Input id="cp-desc" {...form.register("description")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cp-desc-en">{t("Coupon description (English)")}</Label>
                    <Input id="cp-desc-en" {...form.register("descriptionEn")} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="cp-active"
                checked={form.watch("isActive")}
                onCheckedChange={(v) => form.setValue("isActive", v)}
              />
              <Label htmlFor="cp-active" className="cursor-pointer">
                {t("Enable on create")}
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
                {editing ? t("Save changes") : t("Create coupon")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !deleteLoading && setDeleting(v ? deleting : null)}
        title={t("Delete coupon")}
        description={deleting?.code ?? ""}
        confirmText={t("Delete")}
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

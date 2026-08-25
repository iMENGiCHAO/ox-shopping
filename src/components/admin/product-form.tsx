"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/admin/image-uploader";
import { flattenCategoryTree } from "@/components/admin/category-utils";
import { useT } from "@/components/admin/lang-provider";
import type {
  AdminCategoryOption,
  AdminProduct,
  AdminProductStatus,
} from "@/components/admin/types";

/** Product form validation: numeric fields are strings, converted on submit */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, "Product name must be at least 2 characters").max(120),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, digits and hyphens")
      .max(150)
      .optional()
      .or(z.literal("")),
    sku: z.string().trim().min(3, "SKU must be at least 3 characters").max(64),
    price: z.string().min(1, "Please enter a price"),
    compareAtPrice: z.string().optional().or(z.literal("")),
    costPrice: z.string().optional().or(z.literal("")),
    stock: z.string().min(1, "Please enter stock"),
    isPresale: z.boolean(),
    isNew: z.boolean(),
    isHot: z.boolean(),
    categoryId: z.string().min(1, "Please select a category"),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    description: z.string().max(20000).default(""),
    images: z.array(z.string()).default([]),
    attributes: z
      .array(
        z.object({
          name: z.string().trim().max(30, "Attribute name must be at most 30 characters"),
          values: z.string().max(500, "Attribute values are too long"),
          selectable: z.boolean().default(false),
        }),
      )
      .max(30, "At most 30 attributes")
      .default([]),
  })
  .refine(
    (d) => {
      const n = Number(d.price);
      return Number.isFinite(n) && n > 0;
    },
    { message: "Price must be greater than 0", path: ["price"] },
  )
  .refine(
    (d) => {
      const n = Number(d.stock);
      return Number.isInteger(n) && n >= 0;
    },
    { message: "Stock must be a non-negative integer", path: ["stock"] },
  )
  .refine(
    (d) =>
      !d.compareAtPrice ||
      (Number.isFinite(Number(d.compareAtPrice)) && Number(d.compareAtPrice) >= 0),
    { message: "Compare-at price must be a number >= 0", path: ["compareAtPrice"] },
  )
  .refine(
    (d) => !d.costPrice || (Number.isFinite(Number(d.costPrice)) && Number(d.costPrice) >= 0),
    { message: "Cost price must be a number >= 0", path: ["costPrice"] },
  );

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** Product payload submitted to the API */
export interface ProductFormPayload {
  name: string;
  slug?: string;
  description: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  stock: number;
  isPresale?: boolean;
  isNew?: boolean;
  isHot?: boolean;
  sizeChart?: { headers: string[]; rows: string[][] } | null;
  specStock?: Record<string, Record<string, number>> | null;
  images: string[];
  attributes: { name: string; values: string[]; selectable?: boolean }[];
  status: AdminProductStatus;
  categoryId: string;
}

export interface ProductFormProps {
  /** original product when editing, null when creating */
  initial?: AdminProduct | null;
  categories: AdminCategoryOption[];
  /** submitting */
  loading?: boolean;
  onSubmit: (payload: ProductFormPayload) => Promise<void> | void;
}

/** Product create/edit form (used with Dialog) */
export function ProductForm({ initial, categories, loading, onSubmit }: ProductFormProps) {
  const t = useT();

  const isEdit = Boolean(initial);
  const categoryOptions = flattenCategoryTree(categories);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      slug: initial?.slug ?? "",
      sku: initial?.sku ?? "",
      price: initial ? String(Number(initial.price)) : "",
      compareAtPrice: initial?.compareAtPrice != null ? String(Number(initial.compareAtPrice)) : "",
      costPrice: initial?.costPrice != null ? String(Number(initial.costPrice)) : "",
      stock: initial ? String(initial.stock) : "",
      isPresale: initial?.isPresale ?? false,
      isNew: initial?.isNew ?? false,
      isHot: initial?.isHot ?? false,
      categoryId: initial?.categoryId ?? "",
      status: initial?.status ?? "DRAFT",
      description: initial?.description ?? "",
      images: initial?.images ?? [],
      attributes:
        initial?.attributes?.map((a) => ({
          name: a.name,
          values: a.values.join("，"),
          // 与店面 parseAttributes 口径一致：未显式标注时多值组默认可选
          selectable: a.selectable === true ? true : a.selectable === false ? false : a.values.length > 1,
        })) ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "attributes",
  });

  // 规格库存（每个可选组独立维护，0 = 该规格售罄；颜色/尺码等一视同仁）
  const attrWatch = form.watch("attributes");
  const selectableGroups = React.useMemo(
    () =>
      (attrWatch ?? [])
        .map((a) => ({
          name: a.name.trim(),
          values: a.values.split(/[,，、]/).map((v) => v.trim()).filter(Boolean),
          selectable: a.selectable,
        }))
        .filter((a) => a.selectable && a.name && a.values.length > 0),
    [attrWatch],
  );
  const initialSpecAll = (initial?.specStock ?? {}) as Record<string, Record<string, number>>;
  /** { 组名: { 规格值: 输入框字符串 } }，"" = 未追踪 */
  const [specMaps, setSpecMaps] = React.useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      Object.entries(initialSpecAll).map(([g, m]) => [
        g,
        Object.fromEntries(Object.entries(m).map(([v, n]) => [v, String(n)])),
      ]),
    ),
  );
  // 属性组/规格值变化时补齐缺失键（保留已填数字）
  React.useEffect(() => {
    setSpecMaps((prev) => {
      const next: typeof prev = {};
      for (const g of selectableGroups) {
        next[g.name] = { ...(prev[g.name] ?? {}) };
        for (const v of g.values) if (!(v in next[g.name]!)) next[g.name]![v] = "";
      }
      return next;
    });
  }, [selectableGroups]);

  // 参数表编辑（官方 Size Chart 结构：headers + rows）
  const [chart, setChart] = React.useState<{ headers: string[]; rows: string[][] }>(
    () => initial?.sizeChart ?? { headers: ["Size"], rows: [] },
  );

  const handleSubmit = form.handleSubmit((values) => {
    const attributes = values.attributes
      .map((a) => ({
        name: a.name.trim(),
        values: a.values
          .split(/[,，、]/)
          .map((v) => v.trim())
          .filter(Boolean),
        selectable: a.selectable,
      }))
      .filter((a) => a.name && a.values.length > 0);
    // 规格库存：收集全部可选组有输入的条目（留空 = 不追踪该值）
    const specStock: Record<string, Record<string, number>> | null = (() => {
      const out: Record<string, Record<string, number>> = {};
      for (const g of selectableGroups) {
        const entries = Object.entries(specMaps[g.name] ?? {}).filter(([, v]) => v !== "");
        if (entries.length > 0)
          out[g.name] = Object.fromEntries(entries.map(([k, v]) => [k, Math.max(0, Number(v) || 0)]));
      }
      return Object.keys(out).length > 0 ? out : null;
    })();
    // 一致性规则：整件库存 = min(各组规格之和)。任一维度的池都是可售上限，
    // 取最小值保证 Color×Size 任选组合都不会超卖（与下单扣减口径一致）。
    const summedStock = specStock
      ? Math.min(...Object.values(specStock).map((m) => Object.values(m).reduce((a, b) => a + b, 0)))
      : null;
    const chartClean = {
      headers: chart.headers.map((h) => h.trim()).filter(Boolean),
      rows: chart.rows.map((r) => r.map((c) => c.trim())),
    }.rows.length > 0 && chart.headers.filter(Boolean).length >= 2
      ? { headers: chart.headers.map((h) => h.trim()).filter(Boolean), rows: chart.rows.map((r) => r.map((c) => c.trim())) }
      : null;
    const payload: ProductFormPayload = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description,
      sku: values.sku,
      price: Number(values.price),
      compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : null,
      costPrice: values.costPrice ? Number(values.costPrice) : null,
      stock: summedStock ?? Number(values.stock),
      isPresale: values.isPresale,
      isNew: values.isNew,
      isHot: values.isHot,
      sizeChart: chartClean,
      specStock,
      images: values.images,
      attributes,
      status: values.status,
      categoryId: values.categoryId,
    };
    void onSubmit(payload);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-name">{t("ProductName")} *</Label>
          <Input id="pf-name" placeholder={t("Enter a product name")} {...form.register("name")} />
          {form.formState.errors.name ? (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-slug">slug {isEdit ? t("(not editable)") : ""}</Label>
          <Input
            id="pf-slug"
            placeholder="lowercase letters/digits/hyphens, e.g. iphone-15-pro"
            readOnly={isEdit}
            className={cn(isEdit && "bg-muted text-muted-foreground")}
            {...form.register("slug")}
          />
          {form.formState.errors.slug ? (
            <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-sku">SKU *</Label>
          <Input id="pf-sku" placeholder="e.g. IP15PRO-256-BLACK" {...form.register("sku")} />
          {form.formState.errors.sku ? (
            <p className="text-xs text-destructive">{form.formState.errors.sku.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-price">{t("Price (amount)")} *</Label>
          <Input
            id="pf-price"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...form.register("price")}
          />
          {form.formState.errors.price ? (
            <p className="text-xs text-destructive">{form.formState.errors.price.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-compare">{t("Compare-at price (amount, optional)")}</Label>
          <Input
            id="pf-compare"
            type="number"
            step="0.01"
            min="0"
            placeholder="leave empty to skip"
            {...form.register("compareAtPrice")}
          />
          {form.formState.errors.compareAtPrice ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.compareAtPrice.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-cost">{t("Cost price (amount, optional)")}</Label>
          <Input
            id="pf-cost"
            type="number"
            step="0.01"
            min="0"
            placeholder="leave empty to skip"
            {...form.register("costPrice")}
          />
          {form.formState.errors.costPrice ? (
            <p className="text-xs text-destructive">{form.formState.errors.costPrice.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-stock">{t("Stock")} *</Label>
          <Input id="pf-stock" type="number" min="0" placeholder="0" {...form.register("stock")} />
          {form.formState.errors.stock ? (
            <p className="text-xs text-destructive">{form.formState.errors.stock.message}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between space-y-0.5 rounded-lg border border-border px-3 py-2.5 sm:col-span-2">
          <div>
            <Label htmlFor="pf-presale" className="cursor-pointer">预售商品（Pre-order）</Label>
            <p className="text-xs text-muted-foreground">开启后库存为 0 时仍可下单，前台显示「预售」标签</p>
          </div>
          <Switch
            id="pf-presale"
            checked={form.watch("isPresale")}
            onCheckedChange={(checked) => form.setValue("isPresale", checked, { shouldDirty: true })}
          />
        </div>

        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div className="flex items-center justify-between space-y-0.5 rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="pf-isnew" className="cursor-pointer">新品上市（New）</Label>
              <p className="text-xs text-muted-foreground">前台商品卡与详情页显示「New」徽标</p>
            </div>
            <Switch
              id="pf-isnew"
              checked={form.watch("isNew")}
              onCheckedChange={(checked) => form.setValue("isNew", checked, { shouldDirty: true })}
            />
          </div>
          <div className="flex items-center justify-between space-y-0.5 rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="pf-ishot" className="cursor-pointer">热卖（Hot）</Label>
              <p className="text-xs text-muted-foreground">前台商品卡与详情页显示「Hot」徽标</p>
            </div>
            <Switch
              id="pf-ishot"
              checked={form.watch("isHot")}
              onCheckedChange={(checked) => form.setValue("isHot", checked, { shouldDirty: true })}
            />
          </div>
        </div>

        {/* 规格级库存（不同尺寸 = 单独规格商品，0 = 售罄） */}
        {selectableGroups.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2">
            <div>
              <Label>规格库存（每个可选组单独维护，0 = 该规格售罄）</Label>
              <p className="text-xs text-muted-foreground">
                颜色、尺码等每个选项都是独立的库存池；保存后总库存自动取各组之和的最小值，
                前台售罄的选项会画斜线并禁止选择。留空 = 不追踪该选项。
              </p>
            </div>
            {selectableGroups.map((g) => (
              <div key={g.name} className="space-y-2">
                <p className="text-[13px] font-medium">规格库存 · {g.name}</p>
                <div className="flex flex-wrap gap-2">
                  {g.values.map((v) => (
                    <div key={v} className="w-24 space-y-1">
                      <Input
                        inputMode="numeric"
                        placeholder={specMaps[g.name]?.[v] ?? ""}
                        value={specMaps[g.name]?.[v] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, "");
                          setSpecMaps((prev) => ({ ...prev, [g.name]: { ...(prev[g.name] ?? {}), [v]: val } }));
                          // 实时联动：总库存 = min(各组之和)
                          const draft = structuredClone(specMaps);
                          draft[g.name] = { ...(draft[g.name] ?? {}), [v]: val };
                          const sums = Object.entries(draft)
                            .map(([gn, m]) => ({
                              tracked: Object.values(m).some((n) => n !== ""),
                              sum: Object.values(m)
                                .filter((n) => n !== "")
                                .reduce((acc, n) => acc + (Number(n) || 0), 0),
                            }))
                            .filter((g2) => g2.tracked)
                            .map((g2) => g2.sum);
                          if (sums.length > 0)
                            form.setValue("stock", String(Math.min(...sums)), { shouldDirty: true });
                        }}
                      />
                      <p className="text-center text-[11px] text-muted-foreground">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* 产品参数表（官方 Size Chart）：表头 + 明细行 */}
        <div className="space-y-2 rounded-lg border border-border p-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <Label>产品参数对照表（Size Chart）</Label>
              <p className="text-xs text-muted-foreground">填写后前台商品大图下方显示可折叠参数表明细；留空则不显示</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChart((c) => ({ ...c, rows: [...c.rows, c.headers.map(() => "")] }))}
              >
                添加行
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChart((c) => ({ headers: [...c.headers, ""], rows: c.rows.map((r) => [...r, ""]) }))}
              >
                添加列
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setChart({ headers: ["Size"], rows: [] })}>
                清空
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <tbody>
                <tr>
                  {chart.headers.map((h, ci) => (
                    <td key={ci} className="p-1 align-top">
                      <Input
                        value={h}
                        placeholder={ci === 0 ? "Size" : `列 ${ci + 1}`}
                        onChange={(e) =>
                          setChart((c) => ({
                            ...c,
                            headers: c.headers.map((x, i) => (i === ci ? e.target.value : x)),
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="w-8 p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={chart.headers.length <= 2}
                      onClick={() =>
                        setChart((c) => ({ headers: c.headers.slice(0, -1), rows: c.rows.map((r) => r.slice(0, -1)) }))
                      }
                    >
                      −
                    </Button>
                  </td>
                </tr>
                {chart.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="p-1 align-top">
                        <Input
                          value={cell}
                          onChange={(e) =>
                            setChart((c) => ({
                              ...c,
                              rows: c.rows.map((r, i) => (i === ri ? r.map((x, j) => (j === ci ? e.target.value : x)) : r)),
                            }))
                          }
                        />
                      </td>
                    ))}
                    <td className="w-8 p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setChart((c) => ({ ...c, rows: c.rows.filter((_, i) => i !== ri) }))}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("Category")} *</Label>
          <Select
            value={form.watch("categoryId")}
            onValueChange={(v) => form.setValue("categoryId", v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("Please select a category")} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.depth > 0 ? `${"　".repeat(c.depth)}└ ` : ""}
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.categoryId ? (
            <p className="text-xs text-destructive">{form.formState.errors.categoryId.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>{t("Status")}</Label>
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as AdminProductStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">{t("Draft")}</SelectItem>
              <SelectItem value="ACTIVE">{t("Active")}</SelectItem>
              <SelectItem value="ARCHIVED">{t("Archived")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-desc">{t("Product description")}</Label>
          <Textarea
            id="pf-desc"
            rows={4}
            placeholder={t("Detailed product description")}
            {...form.register("description")}
          />
          {form.formState.errors.description ? (
            <p className="text-xs text-destructive">{form.formState.errors.description.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>{t("Product images")}</Label>
          <ImageUploader
            value={form.watch("images")}
            onChange={(urls) => form.setValue("images", urls, { shouldValidate: true })}
          />
        </div>

        <div className="space-y-3 sm:col-span-2">
          <Label>
            Product attributes (check {'"Selectable"'} to make them order options — customers must choose, recorded in cart and order)
          </Label>
          {fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No attributes yet. Click {'"Add attribute"'} below, e.g. {'"Color: Black, White"'} or {'"Size: S, M, L"'}.
            </p>
          ) : null}
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
              <Input
                placeholder={t("Attribute name, e.g. Color / Material / Size")}
                {...form.register(`attributes.${index}.name` as const)}
              />
              <Input
                placeholder={t("Values, comma-separated, e.g. Black, White")}
                {...form.register(`attributes.${index}.values` as const)}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-black"
                  {...form.register(`attributes.${index}.selectable` as const)}
                />
                Selectable
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label={t("Delete this attribute")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {form.formState.errors.attributes ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.attributes.message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: "", values: "", selectable: false })}
          >
            <Plus className="h-4 w-4" />
            Add attribute
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isEdit ? t("Save changes") : t("Create product")}
        </Button>
      </div>
    </form>
  );
}

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
import { variantSignature } from "@/server/services/variant-stock";
import type {
  AdminCategoryOption,
  AdminProduct,
  AdminProductStatus,
} from "@/components/admin/types";

/** Product form validation: numeric fields are strings, converted on submit */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, "商品名称至少 2 个字符").max(120),
    nameEn: z.string().trim().max(120).optional().or(z.literal("")),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "路径标识只能包含小写字母、数字与连字符")
      .max(150)
      .optional()
      .or(z.literal("")),
    sku: z.string().trim().min(3, "SKU 至少 3 个字符").max(64),
    price: z.string().min(1, "请填写价格"),
    compareAtPrice: z.string().optional().or(z.literal("")),
    costPrice: z.string().optional().or(z.literal("")),
    stock: z.string().min(1, "请填写库存"),
    // SKU 矩阵由矩阵区维护（见下方 matrixDraft → setValue 同步）
    variants: z
      .array(
        z.object({
          attributes: z.array(z.object({ name: z.string(), value: z.string() })),
          stock: z.number().int().min(0),
          price: z.number().min(0).nullable(),
          sku: z.string().nullable(),
          isActive: z.boolean(),
        }),
      )
      .optional(),
    isPresale: z.boolean(),
    /** 预售提示文案（多语言）。留空 = 使用站级默认（站点设置中可改）。 */
    presaleNoteZh: z.string().max(200).optional().or(z.literal("")),
    presaleNoteEn: z.string().max(200).optional().or(z.literal("")),
    isNew: z.boolean(),
    isHot: z.boolean(),
    categoryId: z.string().min(1, "请选择分类"),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    description: z.string().max(20000).default(""),
    images: z.array(z.string()).default([]),
    attributes: z
      .array(
        z.object({
          name: z.string().trim().max(30, "属性名最多 30 个字符"),
          values: z.string().max(500, "属性值过长"),
          selectable: z.boolean().default(false),
        }),
      )
      .max(30, "最多 30 个属性")
      .default([]),
  })
  .refine(
    (d) => {
      const n = Number(d.price);
      return Number.isFinite(n) && n > 0;
    },
    { message: "价格必须大于 0", path: ["price"] },
  )
  .refine(
    (d) => {
      const n = Number(d.stock);
      return Number.isInteger(n) && n >= 0;
    },
    { message: "库存必须为非负整数", path: ["stock"] },
  )
  .refine(
    (d) =>
      !d.compareAtPrice ||
      (Number.isFinite(Number(d.compareAtPrice)) && Number(d.compareAtPrice) >= 0),
    { message: "划线价必须为大于等于 0 的数字", path: ["compareAtPrice"] },
  )
  .refine(
    (d) => !d.costPrice || (Number.isFinite(Number(d.costPrice)) && Number(d.costPrice) >= 0),
    { message: "成本价必须为大于等于 0 的数字", path: ["costPrice"] },
  );

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** Product payload submitted to the API */
export interface ProductFormPayload {
  name: string;
  nameEn?: string | null;
  slug?: string;
  description: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  stock: number;
  isPresale?: boolean;
  /** 预售提示文案（多语言）— 留空 = null（前台使用 SiteSetting 站级默认） */
  presaleNoteZh?: string | null;
  presaleNoteEn?: string | null;
  isNew?: boolean;
  isHot?: boolean;
  sizeChart?: { headers: string[]; rows: string[][] } | null;
  specStock?: Record<string, Record<string, number>> | null;
  /** SKU 矩阵（组合粒度）：非空时前台只列真实组合 */
  variants?: {
    id?: string;
    attributes: { name: string; value: string }[];
    stock: number;
    /** 乐观锁：表单加载时的该组合库存快照（服务端锁内比对，防复活超卖） */
    expectedStock?: number | null;
    price?: number | null;
    sku?: string | null;
    image?: string | null;
    isActive?: boolean;
  }[] | null;
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
  // 大爷提问（2026-09-28）：「编辑产品价格以什么货币为准？」—— 此前标签只写
  // 「价格」，运营无法判断币种。这里从汇率接口读取站点基准币种并显式标注；
  // 前台按访客所选币种换算展示，录库的是基准币种金额。
  const [baseCurrency, setBaseCurrency] = React.useState<string>("");
  React.useEffect(() => {
    let alive = true;
    fetch("/api/currency/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const base = (d?.data?.base ?? d?.base) as string | undefined;
        if (alive && base) setBaseCurrency(base);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const t = useT();

  const isEdit = Boolean(initial);
  const categoryOptions = flattenCategoryTree(categories);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: initial?.name ?? "",
      nameEn: initial?.nameEn ?? "",
      slug: initial?.slug ?? "",
      sku: initial?.sku ?? "",
      price: initial ? String(Number(initial.price)) : "",
      compareAtPrice: initial?.compareAtPrice != null ? String(Number(initial.compareAtPrice)) : "",
      costPrice: initial?.costPrice != null ? String(Number(initial.costPrice)) : "",
      stock: initial ? String(initial.stock) : "",
      isPresale: initial?.isPresale ?? false,
      presaleNoteZh: initial?.presaleNoteZh ?? "",
      presaleNoteEn: initial?.presaleNoteEn ?? "",
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
          selectable:
            a.selectable === true ? true : a.selectable === false ? false : a.values.length > 1,
        })) ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "attributes",
  });

  // 规格库存（每个可选组独立维护，0 = 该规格售罄；颜色/尺码等一视同仁）
  const attrWatch = form.watch("attributes");
  // 大爷反馈（2026-09-28）：添加颜色/规格后库存录入框「再加一个才出现」——
  // 根因是 useMemo 依赖的是 form.watch("attributes") 的**数组引用**，而 RHF 在字段
  // 输入过程中会返回同一引用（引用未变 → 不重算 → 派生列表慢一拍）。
  // 改为依赖**内容签名**：内容一变立即重算，库存框即时出现。
  const attrSignature = JSON.stringify(attrWatch ?? []);
  const selectableGroups = React.useMemo(
    () =>
      (attrWatch ?? [])
        .map((a) => ({
          name: a.name.trim(),
          values: a.values
            .split(/[,，、]/)
            .map((v) => v.trim())
            .filter(Boolean),
          selectable: a.selectable,
        }))
        .filter((a) => a.selectable && a.name && a.values.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 以内容签名为准（见上）
    [attrSignature],
  );
  /*
   * ── 多属性业务模型（大爷 2026-09-29 定稿，全站唯一口径）───────────────
   *
   * 1. 属性组的**添加顺序**即层级：第一个添加的可选属性组 = 父组，
   *    后面添加的都是它的子组。不存在「运营切换分组维度」——顺序即业务。
   * 2. 有子组的父组**不能手写库存**：父组每个值的库存恒等于
   *    其名下所有子组组合库存之和（只读派生值）。
   * 3. 商品总库存 = 全部组合库存之和（提交时后端按同一口径重算落库）。
   * 4. 单规格商品（无可选属性组）才允许直接填写总库存。
   * 5. 不硬编码任何属性名：颜色/尺码/材质/容量……任何属性组当父组都遵循同一逻辑。
   */
  const hasGroups = selectableGroups.length > 0;
  const primaryGroup = selectableGroups[0] ?? null;
  /** 只有一个属性组时父组无子组：每个规格值自身就是一个组合，平铺录入 */
  const groupable = selectableGroups.length > 1;

  // 参数表编辑（官方 Size Chart 结构：headers + rows）
  const [chart, setChart] = React.useState<{ headers: string[]; rows: string[][] }>(
    () => initial?.sizeChart ?? { headers: ["尺码"], rows: [] },
  );

  /* ── 组合矩阵（子组规格逐格录入库存）──────────────────────────────────
   * 全组合 = 各属性组按添加顺序做笛卡尔积（父组在外层）。
   * 每个组合一个独立库存池；组合键用后端同构的 variantSignature ——
   * 前后端共用一套签名算法，杜绝「前端键 ≠ 后端键」的数据错位。 */
  const variantCombos = React.useMemo(() => {
    if (selectableGroups.length === 0) return [] as { name: string; value: string }[][];
    return selectableGroups.reduce<{ name: string; value: string }[][]>(
      (acc, g) => acc.flatMap((combo) => g.values.map((v) => [...combo, { name: g.name, value: v }])),
      [[]],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖内容签名（见 selectableGroups）
  }, [attrSignature, selectableGroups]);

  /** 组合键：与后端 variantSignature 完全同构（单一事实来源） */
  const comboKey = (attrs: { name: string; value: string }[]) => variantSignature(attrs);

  /** 矩阵草稿：{ 组合键: { stock: string } }，空串 = 未填（保存时按 0 计） */
  const [matrixDraft, setMatrixDraft] = React.useState<Record<string, { stock: string }>>({});
  // 编辑回填：把已存变体灌进草稿（仅初始化一次，避免覆盖用户输入）
  const matrixInitRef = React.useRef(false);
  React.useEffect(() => {
    if (matrixInitRef.current) return;
    matrixInitRef.current = true;
    const draft: Record<string, { stock: string }> = {};
    const saved = initial?.variants ?? [];
    if (saved.length > 0) {
      for (const v of saved) {
        draft[comboKey(v.attributes)] = { stock: String(v.stock) };
      }
    } else if (initial?.specStock) {
      // 老商品（只有维度池、没有组合数据）：按组合内**各维度库存的最小值**预填 ——
      // 保守口径（不会凭空放大可售量），运营可在矩阵里逐格修正后保存。
      const spec = initial.specStock as Record<string, Record<string, number>>;
      const groups = (initial.attributes ?? [])
        .filter((a) => a.selectable)
        .map((a) => ({
          name: a.name,
          // attributes.values 在 AdminProduct 里可能是数组或逗号串，两种都兼容
          values: Array.isArray(a.values)
            ? a.values
            : String(a.values)
                .split(/[,，、]/)
                .map((v: string) => v.trim())
                .filter(Boolean),
        }));
      const combos = groups.reduce<{ name: string; value: string }[][]>(
        (acc, g) => acc.flatMap((c) => g.values.map((v) => [...c, { name: g.name, value: v }])),
        [[]],
      );
      for (const attrs of combos) {
        const nums = attrs
          .map((a) => spec[a.name]?.[a.value])
          .filter((n): n is number => typeof n === "number");
        const stock = nums.length === attrs.length ? Math.min(...nums) : 0;
        draft[comboKey(attrs)] = { stock: String(Math.max(0, Math.floor(stock))) };
      }
    }
    setMatrixDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.variants, initial?.specStock]);

  /** 商品总库存 = 全部组合之和（实时；保存时后端按同一口径重算） */
  const matrixTotal = variantCombos.reduce((sum, attrs) => {
    const raw = matrixDraft[comboKey(attrs)]?.stock;
    return sum + Math.max(0, Math.floor(Number(raw ?? "0") || 0));
  }, 0);

  /** 某父组值的库存合计（只读派生：其名下全部子组组合之和，不可手写） */
  const groupTotal = (groupValue: string): number =>
    variantCombos
      .filter((combo) => combo.some((a) => a.name === primaryGroup?.name && a.value === groupValue))
      .reduce((sum, attrs) => {
        const raw = matrixDraft[comboKey(attrs)]?.stock;
        return sum + Math.max(0, Math.floor(Number(raw ?? "0") || 0));
      }, 0);

  // 草稿 → form.variants（提交校验与后端落库都用它）。
  // 已存组合保留覆盖价/SKU/组合图/上架状态（矩阵只管库存，不洗其它数据；
  // 组合不在新矩阵里 = 已删除的组，随后端 deleteMany 一并清理）。
  // expectedStock = 表单加载时的库存快照（服务端锁内比对防复活超卖，
  // P1-1 商用审计）；新增组合（prev 不存在）为 null = 跳过比对。
  React.useEffect(() => {
    const saved = initial?.variants ?? [];
    const rows = variantCombos.map((attrs) => {
      const d = matrixDraft[comboKey(attrs)];
      const prev = saved.find((v) => comboKey(v.attributes) === comboKey(attrs));
      return {
        attributes: attrs,
        stock: Math.max(0, Math.floor(Number(d?.stock ?? "0") || 0)),
        expectedStock: prev?.stock ?? null,
        price: prev?.price ?? null,
        sku: prev?.sku ?? null,
        image: prev?.image ?? null,
        isActive: prev?.isActive ?? true,
      };
    });
    form.setValue("variants", rows, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixDraft, variantCombos]);

  // 有规格组时把实时汇总写入 stock 表单值：库存输入框是只读展示（绑 matrixTotal），
  // 但 zod 的 stock 必填校验看的是**表单值** —— 不回写会在「新建 + 带规格」时被拦截。
  // 提交口径仍以 handleSubmit 里的 variantTotal 为准（同一数字，单一事实来源）。
  React.useEffect(() => {
    if (hasGroups) form.setValue("stock", String(matrixTotal), { shouldDirty: true });
  }, [hasGroups, matrixTotal, form]);

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
    // 库存口径（前后端同一规则，大爷 2026-09-29 定稿）：
    //   有可选属性组 → 库存真相在子组组合（variants），总库存 = Σ 组合，
    //     specStock 一并清空（维度池已废止，两套模型并存必然数字对不上）；
    //   无可选属性组 → 单规格商品，总库存直接手填。
    // hasGroups 与上方「库存只读判定」同源（selectableGroups.length > 0）——
    // 不再用 attributes.some(selectable)：那个口径在「勾了可选但值还没填」时
    // 会让库存输入框可编辑、提交却按组合汇总，用户输入被静默丢弃（实测 bug）。
    const variantTotal = (values.variants ?? []).reduce((sum, v) => sum + (v.stock ?? 0), 0);
    const stock = hasGroups ? variantTotal : Number(values.stock);

    const chartClean =
      {
        headers: chart.headers.map((h) => h.trim()).filter(Boolean),
        rows: chart.rows.map((r) => r.map((c) => c.trim())),
      }.rows.length > 0 && chart.headers.filter(Boolean).length >= 2
        ? {
            headers: chart.headers.map((h) => h.trim()).filter(Boolean),
            rows: chart.rows.map((r) => r.map((c) => c.trim())),
          }
        : null;
    const payload: ProductFormPayload = {
      name: values.name,
      nameEn: values.nameEn?.trim() || null,
      slug: values.slug || undefined,
      description: values.description,
      sku: values.sku,
      price: Number(values.price),
      compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : null,
      costPrice: values.costPrice ? Number(values.costPrice) : null,
      stock,
      isPresale: values.isPresale,
      // 留空 = null（前端会用站级默认）；非空 = 覆盖
      presaleNoteZh: values.presaleNoteZh?.trim() || null,
      presaleNoteEn: values.presaleNoteEn?.trim() || null,
      isNew: values.isNew,
      isHot: values.isHot,
      sizeChart: chartClean,
      // 维度池已废止：表单是完整编辑，显式清空存量，避免「维度数字 ≠ 组合之和」
      specStock: null,
      images: values.images,
      attributes,
      status: values.status,
      categoryId: values.categoryId,
    };
    void onSubmit(payload);
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="商品编辑">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-name">{t("ProductName")} *</Label>
          <Input id="pf-name" placeholder={t("Enter a product name")} {...form.register("name")} />
          {form.formState.errors.name ? (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-nameEn">{t("Product name (English)")}（可选）</Label>
          <Input
            id="pf-nameEn"
            placeholder="英文名，用于英文界面展示与 URL 生成，留空则回退中文名"
            {...form.register("nameEn")}
          />
          {form.formState.errors.nameEn ? (
            <p className="text-xs text-destructive">{form.formState.errors.nameEn.message}</p>
          ) : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pf-slug">slug {isEdit ? t("(not editable)") : ""}</Label>
          <Input
            id="pf-slug"
            placeholder="小写字母/数字/连字符，例如 iphone-15-pro"
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
          <Input id="pf-sku" placeholder="例如 IP15PRO-256-BLACK" {...form.register("sku")} />
          {form.formState.errors.sku ? (
            <p className="text-xs text-destructive">{form.formState.errors.sku.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-price">
            {t("Price (amount)")}
            {baseCurrency ? `（${baseCurrency}）` : ""} *
          </Label>
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
          <Label htmlFor="pf-compare">{t("Compare-at price (amount, optional)")}{baseCurrency ? `（${baseCurrency}）` : ""}</Label>
          <Input
            id="pf-compare"
            type="number"
            step="0.01"
            min="0"
            placeholder="留空表示不填写"
            {...form.register("compareAtPrice")}
          />
          {form.formState.errors.compareAtPrice ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.compareAtPrice.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-cost">{t("Cost price (amount, optional)")}{baseCurrency ? `（${baseCurrency}）` : ""}</Label>
          <Input
            id="pf-cost"
            type="number"
            step="0.01"
            min="0"
            placeholder="留空表示不填写"
            {...form.register("costPrice")}
          />
          {form.formState.errors.costPrice ? (
            <p className="text-xs text-destructive">{form.formState.errors.costPrice.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pf-stock">
            {t("Stock")}
            {hasGroups ? "（自动汇总 = 各子组规格之和）" : " *"}
          </Label>
          {hasGroups ? (
            /* 有规格：此处**只读展示实时汇总**（= 下方各组合库存之和）。
               总库存是子组明细的派生值，手写无法回答「加到哪个子组头上」。 */
            <Input
              id="pf-stock"
              value={String(matrixTotal)}
              readOnly
              className={cn("bg-muted text-muted-foreground")}
              tabIndex={-1}
            />
          ) : (
            <Input id="pf-stock" type="number" min="0" placeholder="0" {...form.register("stock")} />
          )}
          {hasGroups ? (
            <p className="text-xs text-muted-foreground">
              该商品有可选规格：总库存 = 下方各子组规格库存之和（自动汇总、不可手写）。
            </p>
          ) : form.formState.errors.stock ? (
            <p className="text-xs text-destructive">{form.formState.errors.stock.message}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between space-y-0.5 rounded-lg border border-border px-3 py-2.5 sm:col-span-2">
          <div>
            <Label htmlFor="pf-presale" className="cursor-pointer">
              预售商品（Pre-order）
            </Label>
            <p className="text-xs text-muted-foreground">
              开启后即使库存为 0 仍可下单，前台显示「预售」标签
            </p>
          </div>
          <Switch
            id="pf-presale"
            checked={form.watch("isPresale")}
            onCheckedChange={(checked) =>
              form.setValue("isPresale", checked, { shouldDirty: true })
            }
          />
        </div>

        {/* 预售提示文案（多语言）— 留空 = 使用站级默认（站点设置 → 预售提示）。
            解耦合：每个商品可单独覆盖中文/英文的预售提示文案；
            全部留空时前台展示 SiteSetting 中的全局默认。 */}
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pf-presale-zh">预售提示（中文）</Label>
            <Input
              id="pf-presale-zh"
              type="text"
              placeholder="留空使用站级默认"
              maxLength={200}
              {...form.register("presaleNoteZh")}
            />
            <p className="text-xs text-muted-foreground">选 CNY 货币或中文语言时显示</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-presale-en">预售提示（英文）</Label>
            <Input
              id="pf-presale-en"
              type="text"
              placeholder="留空则使用站点默认提示"
              maxLength={200}
              {...form.register("presaleNoteEn")}
            />
            <p className="text-xs text-muted-foreground">在非 CNY 货币或英文语言环境下显示</p>
          </div>
        </div>

        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <div className="flex items-center justify-between space-y-0.5 rounded-lg border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="pf-isnew" className="cursor-pointer">
                新品上市（New）
              </Label>
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
              <Label htmlFor="pf-ishot" className="cursor-pointer">
                热卖（Hot）
              </Label>
              <p className="text-xs text-muted-foreground">前台商品卡与详情页显示「Hot」徽标</p>
            </div>
            <Switch
              id="pf-ishot"
              checked={form.watch("isHot")}
              onCheckedChange={(checked) => form.setValue("isHot", checked, { shouldDirty: true })}
            />
          </div>
        </div>

        {/* ── 规格库存（子组组合逐格录入）─────────────────────────────────
            层级由属性添加顺序决定（大爷 2026-09-29 定稿）：
            第一个添加的属性组 = 父组，后面添加的都是子组。
            父组不能手写库存（合计只读），库存数完全由子组各规格决定。 */}
        {hasGroups && primaryGroup ? (
          <div className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>规格库存（按子组规格录入）</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  父组「{primaryGroup.name}」
                  {groupable
                    ? ` × 子组「${selectableGroups
                        .slice(1)
                        .map((g) => g.name)
                        .join(" × ")}」`
                    : "（暂无子组，每个规格值独立计库存）"}
                  ：父组库存由子组各规格自动合计，不可手写；商品总库存 = 全部子组规格之和。
                </p>
              </div>
              <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                组合粒度库存
              </span>
            </div>
            {variantCombos.length > 0 ? (
              <div className="max-h-96 space-y-3 overflow-auto pr-1">
                {/* 商品级总库存 = 全部组合之和（只读派生值，与明细单一口径） */}
                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-[13px]">
                  <span className="text-muted-foreground">
                    商品总库存（= 各子组规格之和，不可手写）
                  </span>
                  <span className="font-medium tabular-nums">{matrixTotal} 件</span>
                </div>
                {/* 父组卡片：每个父组值一行；右侧「库存合计」只读 ——
                    有子组的父组不能添加库存（大爷 2026-09-29），数字完全由子格决定 */}
                {primaryGroup.values.map((groupValue) => {
                  const rows = variantCombos.filter((combo) =>
                    combo.some((a) => a.name === primaryGroup.name && a.value === groupValue),
                  );
                  if (rows.length === 0) return null;
                  return (
                    <div
                      key={groupValue}
                      className={
                        groupable
                          ? "space-y-2 rounded-lg border border-border bg-muted/30 p-3"
                          : "space-y-2"
                      }
                    >
                      {groupable ? (
                        <p className="flex items-center justify-between gap-2 text-[13px] font-medium">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                              父规格
                            </span>
                            <span className="truncate">
                              {primaryGroup.name}：{groupValue}
                            </span>
                          </span>
                          {/* 父组只读：库存合计由子组决定（不能手写） */}
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            库存合计
                            <span className="ml-1 font-medium tabular-nums text-foreground">
                              {groupTotal(groupValue)}
                            </span>
                          </span>
                        </p>
                      ) : null}
                      {/* 子组横排：每个规格一个小单元 —— 上库存框、下规格名 */}
                      <div className="flex flex-wrap gap-3">
                        {rows.map((attrs) => {
                          const key = comboKey(attrs);
                          const label = groupable
                            ? attrs
                                .filter((a) => a.name !== primaryGroup.name)
                                .map((a) => a.value)
                                .join(" / ") || "默认"
                            : attrs.map((a) => a.value).join(" / ");
                          const d = matrixDraft[key] ?? { stock: "" };
                          return (
                            <label key={key} className="flex w-20 flex-col items-stretch gap-1">
                              <Input
                                inputMode="numeric"
                                placeholder="0"
                                value={d.stock}
                                onChange={(e) =>
                                  setMatrixDraft((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...(prev[key] ?? { stock: "" }),
                                      stock: e.target.value.replace(/[^0-9]/g, ""),
                                    },
                                  }))
                                }
                                className="h-8 px-1 text-center tabular-nums"
                                aria-label={`${groupValue} ${label} 库存`}
                              />
                              <span className="truncate text-center text-xs text-muted-foreground">
                                {label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  {groupable
                    ? `按父组「${primaryGroup.name}」的取值分卡片录入：每个子组规格一个库存格，父组合计与商品总库存自动汇总。`
                    : "逐规格录入库存。"}
                  留空按 0 计（该规格售罄，前台划线）。前台选择器按同一套组合联动 ——
                  选了某个{primaryGroup.name}后只会显示真实存在的规格，下单按组合精确扣减。
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">请先在上方填写属性的可选值。</p>
            )}
          </div>
        ) : null}

        {/* 无可选属性时的引导：没有可选规格时矩阵不渲染，运营需要知道去哪录库存 */}
        {selectableGroups.length === 0 ? (
          <div className="space-y-1 rounded-lg border border-dashed border-border p-3 sm:col-span-2">
            <p className="text-[13px] font-medium">规格库存（按子组规格录入）</p>
            <p className="text-xs text-muted-foreground">
              当前商品还没有「可选规格」，总库存直接在上方「库存」填写。
              需要多规格时，请在下方<strong>「商品属性」</strong>里按<strong>添加顺序</strong>添加属性
              （例如先加 Color: Black, White，再加 Size: S, M, L）并勾选<strong>「可选规格」</strong>：
              第一个添加的属性组为父组，后面的都是子组 ——
              之后这里会出现按父组分卡片的库存矩阵，逐个子组规格录入库存；
              父组合计与商品总库存自动汇总（均不可手写），
              前台顾客选了某个父组值后只会看到真实存在的子组规格，下单按组合精确扣减。
            </p>
          </div>
        ) : null}


        {/* 产品参数表（官方 Size Chart）：表头 + 明细行 */}
        <div className="space-y-2 rounded-lg border border-border p-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <Label>产品参数对照表（Size Chart）</Label>
              <p className="text-xs text-muted-foreground">
                填写后前台商品大图下方显示可折叠参数表明细；留空则不显示
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setChart((c) => ({ ...c, rows: [...c.rows, c.headers.map(() => "")] }))
                }
              >
                添加行
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setChart((c) => ({
                    headers: [...c.headers, ""],
                    rows: c.rows.map((r) => [...r, ""]),
                  }))
                }
              >
                添加列
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setChart({ headers: ["尺码"], rows: [] })}
              >
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
                        placeholder={ci === 0 ? "尺码" : `列 ${ci + 1}`}
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
                        setChart((c) => ({
                          headers: c.headers.slice(0, -1),
                          rows: c.rows.map((r) => r.slice(0, -1)),
                        }))
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
                              rows: c.rows.map((r, i) =>
                                i === ri ? r.map((x, j) => (j === ci ? e.target.value : x)) : r,
                              ),
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
                        onClick={() =>
                          setChart((c) => ({ ...c, rows: c.rows.filter((_, i) => i !== ri) }))
                        }
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
            purpose="products"
            value={form.watch("images")}
            onChange={(urls) => form.setValue("images", urls, { shouldValidate: true })}
          />
        </div>

        <div className="space-y-3 sm:col-span-2">
          <Label>
            商品属性（勾选“可选规格”后成为下单选项；<strong>添加顺序即层级</strong>
            ——第一个添加的当父组，后面添加的是子组，子组决定库存）
          </Label>
          {fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无属性，点击下方“添加属性”来新增，例如 先加 “颜色: 黑色, 白色”（父组），
              再加 “尺码: S, M, L”（子组）。
            </p>
          ) : null}
          {fields.map((field, index) => {
            // 从顶层 attrWatch 取值（watch 已在组件顶部订阅一次），
            // 不在循环里调 form.watch()（react-hooks 兼容性告警）
            const gValues = attrWatch?.[index]?.values ?? "";
            const checked = attrWatch?.[index]?.selectable;
            const isSelectableGroup =
              checked === true ||
              (checked !== false && gValues.split(/[,，、]/).filter((v: string) => v.trim()).length > 1);
            // 父/子徽标：第一个「可选」属性组 = 父组，其余可选组 = 子组。
            // 判定完全按字段顺序（添加顺序即业务），不硬编码任何属性名。
            const firstSelectableIdx = (attrWatch ?? []).findIndex(
              (a, i) =>
                i < index &&
                (a.selectable === true ||
                  (a.selectable !== false &&
                    a.values.split(/[,，、]/).filter((v) => v.trim()).length > 1)),
            );
            const role =
              !isSelectableGroup
                ? null
                : firstSelectableIdx === -1
                  ? "父组"
                  : "子组";
            return (
            <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
              <div className="relative">
                <Input
                  placeholder={t("Attribute name, e.g. Color / Material / Size")}
                  {...form.register(`attributes.${index}.name` as const)}
                />
                {role ? (
                  <span
                    className={
                      role === "父组"
                        ? "absolute -top-2 left-2 rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground"
                        : "absolute -top-2 left-2 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                    }
                  >
                    {role}
                  </span>
                ) : null}
              </div>
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
                <span title="勾选后该属性参与规格库存管理（如颜色/尺码）——下方会出现按组合录入库存的矩阵">
                  可选规格
                </span>
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
            );
          })}
          {form.formState.errors.attributes ? (
            <p className="text-xs text-destructive">{form.formState.errors.attributes.message}</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ name: "", values: "", selectable: false })}
          >
            <Plus className="h-4 w-4" />
            添加属性
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

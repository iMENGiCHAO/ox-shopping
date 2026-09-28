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
  // 属性组/规格值变化时：
  // 1) 补齐缺失键（保留已填数字）
  // 2) 检测 group name 重命名：若旧 key 不在新列表里但有一个未匹配项，迁移其库存
  React.useEffect(() => {
    setSpecMaps((prev) => {
      const next: typeof prev = {};
      const newNames = new Set(selectableGroups.map((g) => g.name));
      for (const g of selectableGroups) {
        next[g.name] = { ...(prev[g.name] ?? {}) };
        for (const v of g.values) if (!(v in next[g.name]!)) next[g.name]![v] = "";
      }
      // 迁移：prev 里存在但 newNames 里没有的 key（被改名的旧组）
      const orphans = Object.keys(prev).filter((k) => !newNames.has(k));
      for (const oldKey of orphans) {
        // 在 next 里找一个未匹配的同前缀组名（启发式：startsWith），尽量自动迁移
        const candidate = selectableGroups.find(
          (g) =>
            g.name !== oldKey && g.name.toLowerCase().includes(oldKey.toLowerCase().slice(0, 3)),
        );
        if (
          candidate &&
          next[candidate.name] &&
          Object.keys(next[candidate.name] ?? {}).length === 0
        ) {
          next[candidate.name] = { ...prev[oldKey]! };
        } else {
          // 找不到匹配的新组：保留为孤儿键，最终不写入 payload（用户可手动复制）
          // 不在 next 里放孤儿键即可
        }
      }
      return next;
    });
  }, [selectableGroups]);

  // 参数表编辑（官方 Size Chart 结构：headers + rows）
  const [chart, setChart] = React.useState<{ headers: string[]; rows: string[][] }>(
    () => initial?.sizeChart ?? { headers: ["尺码"], rows: [] },
  );

  /** 规格库存实时汇总（与提交口径完全一致：min(各组之和)）。
   *  有规格的商品「总库存」不再是可编辑输入 —— 它只是规格库存的派生只读值，
   *  直接填写总库存无法回答「加到哪个规格头上」的业务问题（大爷 2026-09-24 指出）。 */
  const hasSpecGroups = selectableGroups.length > 0;
  const specSum = React.useMemo(() => {
    if (!hasSpecGroups) return null;
    const sums: number[] = [];
    for (const g of selectableGroups) {
      const entries = Object.entries(specMaps[g.name] ?? {}).filter(([, v]) => v !== "");
      if (entries.length === 0) return null; // 某组还没填任何值 → 视为尚未追踪
      sums.push(entries.reduce((acc, [, v]) => acc + (Number(v) || 0), 0));
    }
    return sums.length > 0 ? Math.min(...sums) : null;
  }, [hasSpecGroups, selectableGroups, specMaps]);

  /* ── SKU 矩阵（组合粒度）────────────────────────────────────────────
     大爷诉求：不同颜色有不同尺码范围时，顾客必须只看到真实存在的组合。
     这里把「颜色 × 尺码」展开为完整矩阵，逐格录入库存（可选覆盖价/SKU），
     提交时写入 form.variants（后端按组合粒度落库并汇总商品级库存）。 */
  const variantCombos = React.useMemo(() => {
    if (selectableGroups.length === 0) return [] as { name: string; value: string }[][];
    return selectableGroups.reduce<{ name: string; value: string }[][]>(
      (acc, g) => acc.flatMap((combo) => g.values.map((v) => [...combo, { name: g.name, value: v }])),
      [[]],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖内容签名（见 selectableGroups）
  }, [attrSignature, selectableGroups]);

  /** 组合键（与后端 signature 同构：属性按名排序拼 "名:值|名:值"） */
  const comboKey = (attrs: { name: string; value: string }[]) =>
    attrs
      .map((a) => `${a.name.trim()}:${a.value.trim()}`)
      .sort()
      .join("|");

  /**
   * 分组维度 —— **完全动态、不硬编码任何属性名**（大爷 2026-09-28：
   * 「不要硬编码，可以不是颜色来分组搭配规格的情况呢」）。
   * 任意属性组都能当分组头（颜色/尺码/材质/容量…），默认取第一个组，运营可在
   * 「分组方式」里切换；组内自动列出其余维度的组合。仅一个属性组时退化为平铺录入。
   */
  const [groupByName, setGroupByName] = React.useState<string>("");
  const primaryGroup =
    selectableGroups.find((g) => g.name === groupByName) ?? selectableGroups[0] ?? null;
  /** 只有一个属性组时无需分组头（平铺即等价，避免多一层视觉噪音） */
  const groupable = selectableGroups.length > 1;

  /** 矩阵草稿：{ 组合键: { stock: string; price: string; sku: string } } */
  const [matrixDraft, setMatrixDraft] = React.useState<
    Record<string, { stock: string; price: string; sku: string }>
  >({});
  // **默认启用**：大爷反馈「还是各写各的库存，一点业务逻辑都没有」——
  // 根因是矩阵只是个默认关闭的开关，运营打开商品看到的是老的维度池（各写各的）。
  // 组合粒度（每个「颜色×尺码」独立库存）才是正确商业逻辑，因此不再需要开关。
  const matrixEnabled = true;
  // 编辑回填：把已存变体灌进草稿（仅初始化一次，避免覆盖用户输入）
  const matrixInitRef = React.useRef(false);
  React.useEffect(() => {
    if (matrixInitRef.current) return;
    matrixInitRef.current = true;
    const draft: Record<string, { stock: string; price: string; sku: string }> = {};
    const saved = initial?.variants ?? [];
    if (saved.length > 0) {
      for (const v of saved) {
        draft[comboKey(v.attributes)] = {
          stock: String(v.stock),
          price: v.price == null ? "" : String(v.price),
          sku: v.sku ?? "",
        };
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
        draft[comboKey(attrs)] = { stock: String(Math.max(0, Math.floor(stock))), price: "", sku: "" };
      }
    }
    setMatrixDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.variants, initial?.specStock]);

  /** 组合库存实时汇总（上方「库存（自动汇总）」与矩阵区共用同一口径） */
  const matrixTotal = variantCombos.reduce((sum, attrs) => {
    const raw = matrixDraft[comboKey(attrs)]?.stock;
    return sum + Math.max(0, Math.floor(Number(raw ?? "0") || 0));
  }, 0);

  // 草稿 → form.variants（提交校验与后端落库都用它）；未启用矩阵则清空
  React.useEffect(() => {
    if (!matrixEnabled) {
      form.setValue("variants", [], { shouldDirty: true });
      return;
    }
    const rows = variantCombos.map((attrs) => {
      const d = matrixDraft[comboKey(attrs)];
      return {
        attributes: attrs,
        stock: Math.max(0, Math.floor(Number(d?.stock ?? "0") || 0)),
        price: d?.price && d.price.trim() !== "" ? Number(d.price) : null,
        sku: d?.sku?.trim() || null,
        isActive: true,
      };
    });
    form.setValue("variants", rows, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixDraft, matrixEnabled, variantCombos]);
  React.useEffect(() => {
    if (specSum != null) form.setValue("stock", String(specSum), { shouldDirty: true });
  }, [specSum, form]);
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
    // 库存口径（大爷 2026-09-28）：有属性组时**只提交组合粒度**（variants），
    // 维度池 specStock 清空 —— 两套模型并存必然出现「维度数字 ≠ 组合之和」。
    // variants 由矩阵区维护（见 matrixDraft → form.setValue("variants")）。
    const hasAttributeGroups = (values.attributes ?? []).some((a) => a.selectable);

    // 规格库存：收集全部可选组有输入的条目（留空 = 不追踪该值）
    const specStock: Record<string, Record<string, number>> | null = (() => {
      const out: Record<string, Record<string, number>> = {};
      for (const g of selectableGroups) {
        const entries = Object.entries(specMaps[g.name] ?? {}).filter(([, v]) => v !== "");
        if (entries.length > 0)
          out[g.name] = Object.fromEntries(
            entries.map(([k, v]) => [k, Math.max(0, Number(v) || 0)]),
          );
      }
      return Object.keys(out).length > 0 ? out : null;
    })();
    // 有属性组 → 维度池不参与（清空），库存真相在 variants
    // 一致性规则：整件库存 = min(各组规格之和)。任一维度的池都是可售上限，
    // 取最小值保证 Color×Size 任选组合都不会超卖（与下单扣减口径一致）。
    // 矩阵模式：商品级库存 = Σ 组合库存（与后端落库口径一致；父维度永不手算）
    const variantTotal = (values.variants ?? []).reduce((sum, v) => sum + (v.stock ?? 0), 0);

    const summedStock = specStock
      ? Math.min(
          ...Object.values(specStock).map((m) => Object.values(m).reduce((a, b) => a + b, 0)),
        )
      : null;
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
      stock: hasAttributeGroups ? variantTotal : (summedStock ?? Number(values.stock)),
      isPresale: values.isPresale,
      // 留空 = null（前端会用站级默认）；非空 = 覆盖
      presaleNoteZh: values.presaleNoteZh?.trim() || null,
      presaleNoteEn: values.presaleNoteEn?.trim() || null,
      isNew: values.isNew,
      isHot: values.isHot,
      sizeChart: chartClean,
      specStock: hasAttributeGroups ? null : specStock,
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
            {hasSpecGroups ? "（自动汇总）" : " *"}
          </Label>
          {hasSpecGroups ? (
            /* 有规格：此处**只读展示实时汇总**（= 下方各组合库存之和），
               大爷实测指出此前绑的是静态表单值，改明细后这个数字不动 */
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
          {hasSpecGroups ? (
            <p className="text-xs text-muted-foreground">
              该商品有可选规格：总库存由各规格库存自动汇总（各组之和取最小值），
              请在下方「规格库存」逐规格填写。
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

        {/* ── SKU 矩阵（组合粒度）─────────────────────────────────────────
            大爷诉求：不同颜色有不同尺码范围时，顾客必须只看到真实存在的组合。
            开启后每个「颜色×尺码」组合独立库存；前台选择器按组合过滤
            （选红色后不会出现红色没有的尺码）。关闭 = 回落下面的维度池规格库存。 */}
        {selectableGroups.length > 0 ? (
          <div className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label>规格库存（按组合录入）</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  每个「{selectableGroups.map((g) => g.name).join(" × ")}」组合都是一个独立库存池，
                  由下面的分组卡片逐格录入 —— 顾客只会看到真实存在的组合，选了某个
                  {selectableGroups[0]?.name ?? "规格"}后，其余规格自动收窄到真实存在的那些。
                </p>
              </div>
              <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                组合粒度库存
              </span>
            </div>
            {matrixEnabled ? (
              variantCombos.length > 0 && primaryGroup ? (
                <>
                  {groupable ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">分组方式</span>
                      <select
                        value={primaryGroup.name}
                        onChange={(e) => setGroupByName(e.target.value)}
                        className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
                      >
                        {selectableGroups.map((g) => (
                          <option key={g.name} value={g.name}>
                            按「{g.name}」分组
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                <div className="max-h-96 space-y-3 overflow-auto pr-1">
                  {/* 商品级总库存 = 全部组合之和（只读；避免与矩阵明细两套口径） */}
                  <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-[13px]">
                    <span className="text-muted-foreground">商品总库存（自动汇总，不可手写）</span>
                    <span className="font-medium">{matrixTotal} 件</span>
                  </div>
                  {/* 大爷（2026-09-28）：子组**横着排**，且去掉「覆盖价 / SKU」——
                      同一商品同价同 SKU，没必要逐组合单独编辑；只保留「规格 + 库存」。 */}
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
                          <p className="flex items-center justify-between text-[13px] font-medium">
                            <span>
                              {primaryGroup.name}：{groupValue}
                            </span>
                            {/* 父组只读：库存合计由子组决定（不能手写） */}
                            <span className="text-xs font-normal text-muted-foreground">
                              库存合计 {rows.reduce((sum, attrs) => {
                                const raw = matrixDraft[comboKey(attrs)]?.stock;
                                return sum + Math.max(0, Math.floor(Number(raw ?? "0") || 0));
                              }, 0)}
                            </span>
                          </p>
                        ) : null}
                        {/* 子组**横排**（大爷 2026-09-28）：每个规格是一个竖着的小单元
                            —— 上面库存框、下面规格名，单元之间横向并排；只保留库存，
                            不再逐组合填「覆盖价 / SKU」（同商品同价同 SKU）。 */}
                        <div className="flex flex-wrap gap-3">
                          {rows.map((attrs) => {
                            const key = comboKey(attrs);
                            const label = groupable
                              ? attrs
                                  .filter((a) => a.name !== primaryGroup.name)
                                  .map((a) => a.value)
                                  .join(" / ") || "默认"
                              : attrs.map((a) => a.value).join(" / ");
                            const d = matrixDraft[key] ?? { stock: "", price: "", sku: "" };
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
                                        ...(prev[key] ?? { stock: "", price: "", sku: "" }),
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
                      ? `按「${primaryGroup.name}」分组录入：每组下面列出它的其余规格与库存。`
                      : "逐规格录入库存。"}
                    商品级「总库存」保存时自动汇总为各组合之和；留空按 0 计（该组合售罄，前台划线）。
                    前台选择器用同一套组合联动 —— 选了某个{primaryGroup.name}，只会显示它真实存在的规格。
                  </p>
                </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">请先在上方填写属性的可选值。</p>
              )
            ) : null}
          </div>
        ) : null}

        {/* 无可选属性时的引导（大爷 2026-09-28：「还是没看到改变」的根因就是这里 ——
            商品属性没勾「可选规格」时，下面整块矩阵不渲染，运营完全不知道去哪录库存） */}
        {selectableGroups.length === 0 ? (
          <div className="space-y-1 rounded-lg border border-dashed border-border p-3 sm:col-span-2">
            <p className="text-[13px] font-medium">规格库存（按组合录入）</p>
            <p className="text-xs text-muted-foreground">
              当前商品还没有「可选规格」。请在上方<strong>「规格属性」</strong>里添加属性
              （例如 Color: Black, White；Size: S, M, L），并<strong>勾选该属性的「可选规格」</strong> ——
              之后这里会出现按属性分组的库存矩阵：每个「颜色 × 尺码」组合独立录入库存，
              商品总库存自动汇总（父组只读），
              前台顾客选了某个颜色后只会看到它真实存在的尺码，下单也按组合精确扣减。
            </p>
          </div>
        ) : null}

        {/* 规格级库存（维度池）—— **仅在矩阵关闭时可用**：
            矩阵（组合粒度）与维度池（各维度独立计数）是两套互斥的库存模型，
            同时可编辑会让「父维度数字」与「组合之和」对不上（大爷 2026-09-28：
            「不能都可以编辑，那数字不符合逻辑，以后库存就出乱子」）。 */}
        {selectableGroups.length > 0 && !matrixEnabled ? (
          <div className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2">
            <div>
              <Label>规格库存（每个可选组单独维护，0 = 该规格售罄）</Label>
              <p className="text-xs text-muted-foreground">
                颜色、尺码等每个选项都是独立的库存池；保存后总库存自动取各组之和的最小值，
                前台售罄的选项会画斜线。留空 = 不追踪该选项。
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
                          setSpecMaps((prev) => ({
                            ...prev,
                            [g.name]: { ...(prev[g.name] ?? {}), [v]: val },
                          }));
                          // 实时联动：总库存 = min(各组之和)
                          const draft = structuredClone(specMaps);
                          draft[g.name] = { ...(draft[g.name] ?? {}), [v]: val };
                          const sums = Object.entries(draft)
                            .map(([, m]) => ({
                              tracked: Object.values(m).some((n) => n !== ""),
                              sum: Object.values(m)
                                .filter((n) => n !== "")
                                .reduce((acc, n) => acc + (Number(n) || 0), 0),
                            }))
                            .filter((g2) => g2.tracked)
                            .map((g2) => g2.sum);
                          if (sums.length > 0)
                            form.setValue("stock", String(Math.min(...sums)), {
                              shouldDirty: true,
                            });
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
            商品属性（勾选“可选”后将成为下单选项——顾客必须选择，并记录到购物车与订单中）
          </Label>
          {fields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无属性，点击下方“添加属性”来新增，例如 “颜色: 黑色, 白色” 或 “尺码: S, M, L”。
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
          ))}
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

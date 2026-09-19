"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, PackageCheck, Truck, Zap, Banknote, Gift } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ApiClientError } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import type { ShippingOption } from "@/components/admin/shipping-methods-manager";
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

/* ────────────────────────── 校验 Schema ────────────────────────── */

const CODE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 文本字段统一「trim + 空串允许」（空串提交时转 null） */
const text = (max: number, required?: string) =>
  required
    ? z.string().trim().min(1, required).max(max, `最多 ${max} 字`)
    : z.string().trim().max(max, `最多 ${max} 字`);

const numberField = (label: string, integer = false) =>
  z
    .number({ invalid_type_error: `请输入${label}` })
    .min(0, `${label}不能为负数`)
    .refine((n) => Number.isFinite(n), `请输入${label}`)
    .refine((n) => !integer || Number.isInteger(n), `${label}须为整数`);

const baseSchema = z.object({
  name: text(64, "请填写显示名（顾客在结账页看到）"),
  nameEn: text(64),
  code: text(64, "请填写代号").regex(CODE_SLUG, "仅小写字母、数字、短横线，如 sf-express"),
  description: text(500),
  descriptionEn: text(500),
  etaZh: text(64),
  etaEn: text(64),
  fee: numberField("运费"),
  freeOver: numberField("免邮门槛"),
  sortOrder: numberField("排序", true),
  isCashOnDelivery: z.boolean(),
  isActive: z.boolean(),
});

type MethodFormValues = z.infer<typeof baseSchema>;

/* ────────────────────────── 快速模板 ────────────────────────── */

interface PresetDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * 提示文案生成器。金额必须走传入的 `fmt`（门店基础币种，服务端 `env.CURRENCY`
   * 经 props 透传）—— 早期这里写死 `$8 / 满 $60 免邮`，门店改用 EUR 后提示仍显示
   * 美元符号，属于把币种硬编码进 UI。
   */
  hint: (fmt: (n: number) => string) => string;
  data: Omit<MethodFormValues, "sortOrder" | "isActive">;
}

/** 元组类型：PRESETS[0] 在 noUncheckedIndexedAccess 下仍为非空（固定首项=默认模板） */
const PRESETS: [PresetDef, PresetDef, PresetDef, PresetDef] = [
  {
    key: "standard",
    label: "标准物流",
    icon: Truck,
    hint: (fmt) => `运费 ${fmt(8)} · 满 ${fmt(60)} 免邮`,
    data: {
      name: "标准物流",
      nameEn: "Standard Shipping",
      code: "standard",
      description: "",
      descriptionEn: "",
      etaZh: "5-7 个工作日送达",
      etaEn: "5-7 business days",
      fee: 8,
      freeOver: 60,
      isCashOnDelivery: false,
    },
  },
  {
    key: "express",
    label: "特快专递",
    icon: Zap,
    hint: (fmt) => `运费 ${fmt(20)} · 不免邮`,
    data: {
      name: "特快专递",
      nameEn: "Express Shipping",
      code: "express",
      description: "",
      descriptionEn: "",
      etaZh: "1-3 个工作日送达",
      etaEn: "1-3 business days",
      fee: 20,
      freeOver: 0,
      isCashOnDelivery: false,
    },
  },
  {
    key: "cod",
    label: "货到付款",
    icon: Banknote,
    hint: () => "到付 · 顾客收货时付运费",
    data: {
      name: "货到付款",
      nameEn: "Cash on Delivery",
      code: "cod",
      description: "",
      descriptionEn: "",
      etaZh: "3-6 个工作日送达",
      etaEn: "3-6 business days",
      fee: 5,
      freeOver: 0,
      isCashOnDelivery: true,
    },
  },
  {
    key: "free",
    label: "全场免邮",
    icon: Gift,
    hint: (fmt) => `运费 ${fmt(0)} · 无门槛`,
    data: {
      name: "免邮配送",
      nameEn: "Free Shipping",
      code: "free-shipping",
      description: "",
      descriptionEn: "",
      etaZh: "5-10 个工作日送达",
      etaEn: "5-10 business days",
      fee: 0,
      freeOver: 0,
      isCashOnDelivery: false,
    },
  },
];

/** 英文名 → 代号（slug）：小写、非法字符归并为短横线、去首尾短横线 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** 表单值 → API payload（空串转 null，匹配服务端 nullable 语义） */
function toPayload(v: MethodFormValues) {
  return {
    name: v.name,
    nameEn: v.nameEn || null,
    description: v.description || null,
    descriptionEn: v.descriptionEn || null,
    code: v.code,
    fee: v.fee,
    freeOver: v.freeOver,
    sortOrder: v.sortOrder,
    isCashOnDelivery: v.isCashOnDelivery,
    isActive: v.isActive,
    etaZh: v.etaZh || null,
    etaEn: v.etaEn || null,
  };
}

/* ────────────────────────── 组件 ────────────────────────── */

export interface ShippingMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入 = 编辑模式（代号只读）；null = 创建模式 */
  method: ShippingOption | null;
  /** 已存在的代号（创建模式做行内查重） */
  existingCodes: string[];
  /** 创建模式的默认排序（列表最大 sortOrder + 1） */
  nextSortOrder: number;
  /** 门店基础币种（服务端 `env.CURRENCY` 透传）—— 快速模板的金额提示按它渲染 */
  baseCurrency: string;
  /** 保存成功回调（manager 负责刷新列表） */
  onSaved: (created: boolean) => void;
}

export function ShippingMethodDialog({
  open,
  onOpenChange,
  method,
  existingCodes,
  nextSortOrder,
  baseCurrency,
  onSaved,
}: ShippingMethodDialogProps) {
  const isEdit = !!method;
  /** 门店基础币种的金额格式化（预设模板的提示文案用） */
  const fmtBase = React.useCallback((n: number) => formatMoney(n, baseCurrency), [baseCurrency]);
  const [saving, setSaving] = React.useState(false);
  /** 当前高亮的快速模板 key（用户改动后取消高亮） */
  const [appliedPreset, setAppliedPreset] = React.useState<string | null>(null);
  /** 用户是否手动改过代号（决定英文名是否继续联动生成） */
  const codeTouchedRef = React.useRef(false);

  /** 创建模式：代号查重（编辑模式代号只读，不校验重复） */
  const schema = React.useMemo(() => {
    if (isEdit) return baseSchema;
    return baseSchema.superRefine((v, ctx) => {
      if (existingCodes.includes(v.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["code"],
          message: "该代号已被其他物流方式使用",
        });
      }
    });
  }, [isEdit, existingCodes]);

  const form = useForm<MethodFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...PRESETS[0].data, sortOrder: 0, isActive: true },
  });

  const { errors } = form.formState;
  const values = form.watch();
  const err = (name: keyof MethodFormValues) => errors[name]?.message as string | undefined;

  /* 打开时初始化（create 套用默认模板 / edit 回填） */
  React.useEffect(() => {
    if (!open) return;
    codeTouchedRef.current = isEdit;
    setAppliedPreset(isEdit ? null : PRESETS[0].key);
    form.reset(
      isEdit && method
        ? {
            name: method.name,
            nameEn: method.nameEn ?? "",
            code: method.code,
            description: method.description ?? "",
            descriptionEn: method.descriptionEn ?? "",
            etaZh: method.etaZh ?? "",
            etaEn: method.etaEn ?? "",
            fee: method.fee,
            freeOver: method.freeOver,
            sortOrder: method.sortOrder,
            isCashOnDelivery: method.isCashOnDelivery,
            isActive: method.isActive,
          }
        : { ...PRESETS[0].data, sortOrder: nextSortOrder, isActive: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method, nextSortOrder]);

  /* 英文名 → 自动生成代号（仅创建模式且用户未手动改过代号时） */
  React.useEffect(() => {
    if (!open) return;
    const sub = form.watch((_v, info) => {
      if (info.name === "code" && info.type) codeTouchedRef.current = true;
      if (info.name === "nameEn" && !codeTouchedRef.current && !isEdit) {
        const slug = slugify(form.getValues("nameEn"));
        if (slug) form.setValue("code", slug);
      }
    });
    return () => sub.unsubscribe();
  }, [open, isEdit, form]);

  const applyPreset = (preset: PresetDef) => {
    form.reset({
      ...preset.data,
      // 保留用户已调整的排序与启用状态
      sortOrder: form.getValues("sortOrder"),
      isActive: form.getValues("isActive"),
    });
    codeTouchedRef.current = false;
    setAppliedPreset(preset.key);
  };

  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    try {
      const payload = toPayload(v);
      if (isEdit && method) {
        const { code: _code, ...update } = payload;
        await apiFetch(`/api/admin/shipping-methods/${method.id}`, {
          method: "PUT",
          body: JSON.stringify(update),
        });
        toast.success("物流方式已保存");
      } else {
        await apiFetch("/api/admin/shipping-methods", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("物流方式已创建");
      }
      onOpenChange(false);
      onSaved(isEdit);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "CODE_EXISTS") {
        form.setError("code", { message: e.message });
        return; // finally 关闭 loading
      }
      toast.error(e instanceof Error ? e.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  });

  /* 结账页预览（与 checkout-flow.tsx 的渲染口径一致：desc = description ?? etaZh） */
  const previewDesc = values.description || values.etaZh;
  const previewFee = values.isCashOnDelivery
    ? "到付"
    : values.fee === 0
      ? "免邮"
      : formatMoney(values.fee);

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑物流方式 — ${method?.name}` : "新建物流方式"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "修改后立即生效；代号创建后不可修改（订单与前台结账按代号关联）。"
              : "从下方快速模板开始，套用后可继续修改；也可直接从空白填写。"}
          </DialogDescription>
        </DialogHeader>

        {/* 快速模板（仅创建模式） */}
        {!isEdit && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="快速模板">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                aria-pressed={appliedPreset === p.key}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  appliedPreset === p.key
                    ? "border-primary bg-primary/[0.04] ring-1 ring-primary"
                    : "border-border hover:border-foreground/30 hover:bg-muted/40"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <p.icon className="h-4 w-4" />
                  {p.label}
                </span>
                <span className="text-xs leading-tight text-muted-foreground">
                  {p.hint(fmtBase)}
                </span>
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5" noValidate>
          {/* ── 基础信息 ─────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-sm font-medium">基础信息</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sm-name">
                  显示名（中文）
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="sm-name"
                  placeholder="如：标准物流"
                  {...form.register("name")}
                  aria-invalid={!!err("name")}
                />
                {err("name") && <p className="text-xs text-destructive">{err("name")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-name-en">英文名（可选）</Label>
                <Input
                  id="sm-name-en"
                  placeholder="Standard Shipping"
                  {...form.register("nameEn")}
                />
                <p className="text-xs text-muted-foreground">
                  英文站结账页显示；留空时沿用中文名。
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sm-code">
                  代号{" "}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </Label>
                <Input
                  id="sm-code"
                  placeholder="standard"
                  className="font-mono data-[read-only]:cursor-not-allowed data-[read-only]:bg-muted data-[read-only]:text-muted-foreground"
                  readOnly={isEdit}
                  aria-invalid={!!err("code")}
                  {...form.register("code")}
                />
                {err("code") ? (
                  <p className="text-xs text-destructive">{err("code")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isEdit
                      ? "代号创建后不可修改。"
                      : "系统会根据英文名自动生成；代号用于订单与前台结账关联。"}
                  </p>
                )}
              </div>
            </div>
          </section>

          <Separator />

          {/* ── 顾客展示 ─────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-sm font-medium">顾客展示</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sm-description">配送说明（中文，可选）</Label>
                <Input
                  id="sm-description"
                  placeholder="如：下单后 48 小时内发出"
                  {...form.register("description")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-description-en">Description (English)</Label>
                <Input id="sm-description-en" {...form.register("descriptionEn")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-eta-zh">送达时间（中文）</Label>
                <Input
                  id="sm-eta-zh"
                  placeholder="如：5-7 个工作日送达"
                  {...form.register("etaZh")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-eta-en">ETA (English)</Label>
                <Input id="sm-eta-en" placeholder="5-7 business days" {...form.register("etaEn")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              结账页展示优先级：配送说明优先于送达时间（两者都填写时，顾客看到的是配送说明）。
            </p>
          </section>

          <Separator />

          {/* ── 运费规则 ─────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-sm font-medium">运费规则</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sm-fee">基础运费</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="sm-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-6 tabular-nums"
                    aria-invalid={!!err("fee")}
                    {...form.register("fee", { valueAsNumber: true })}
                  />
                </div>
                {err("fee") ? (
                  <p className="text-xs text-destructive">{err("fee")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">顾客选此方式时收取的运费。</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-free-over">免邮门槛</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="sm-free-over"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-6 tabular-nums"
                    aria-invalid={!!err("freeOver")}
                    {...form.register("freeOver", { valueAsNumber: true })}
                  />
                </div>
                {err("freeOver") ? (
                  <p className="text-xs text-destructive">{err("freeOver")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    订单满该金额免运费；填 0 表示不提供免邮。
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sm-sort-order">排序</Label>
                <Input
                  id="sm-sort-order"
                  type="number"
                  min="0"
                  className="tabular-nums"
                  aria-invalid={!!err("sortOrder")}
                  {...form.register("sortOrder", { valueAsNumber: true })}
                />
                {err("sortOrder") ? (
                  <p className="text-xs text-destructive">{err("sortOrder")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">数字小的在结账页排前面。</p>
                )}
              </div>
            </div>
          </section>

          <Separator />

          {/* ── 选项 ─────────────────────────────────── */}
          <section className="space-y-3">
            <h4 className="text-sm font-medium">选项</h4>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">货到付款（到付）</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    开启后该方式运费不计入订单总额，由顾客收货时向快递员支付。
                  </span>
                </span>
                <Switch
                  checked={values.isCashOnDelivery}
                  onCheckedChange={(v) => form.setValue("isCashOnDelivery", v)}
                />
              </label>
              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">
                    {isEdit ? "启用（前台可见）" : "创建后立即启用"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    停用的方式不会出现在前台结账页，但历史订单不受影响。
                  </span>
                </span>
                <Switch
                  checked={values.isActive}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
              </label>
            </div>
          </section>

          {/* ── 顾客结账页预览 ─────────────────────────── */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-sm font-medium">
              <PackageCheck className="h-4 w-4 text-muted-foreground" />
              顾客结账页预览
            </h4>
            <div
              className={`rounded-lg border p-3 ${values.isActive ? "border-border bg-card" : "border-dashed border-border bg-muted/30 opacity-60"}`}
              aria-label="结账页预览"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-primary">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    </span>
                    {values.name || "物流方式名称"}
                  </p>
                  {previewDesc && (
                    <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{previewDesc}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6">
                    {values.isCashOnDelivery && (
                      <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        货到付款
                      </span>
                    )}
                    {values.freeOver > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        订单满 {formatMoney(values.freeOver)} 免运费
                      </span>
                    )}
                    {!values.isActive && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        已停用 — 前台不可见
                      </span>
                    )}
                  </div>
                </div>
                <p className="whitespace-nowrap text-sm font-medium">{previewFee}</p>
              </div>
            </div>
          </section>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button type="submit" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "保存修改" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

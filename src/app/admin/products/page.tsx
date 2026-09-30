"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw, ApiClientError } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ProductForm, type ProductFormPayload } from "@/components/admin/product-form";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { flattenCategoryTree } from "@/components/admin/category-utils";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { BulkActionBar } from "@/components/admin/bulk-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { CellText } from "@/components/admin/cell-text";
import { useT } from "@/components/admin/lang-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AdminCategoryOption,
  AdminListResult,
  AdminProduct,
  AdminProductStatus,
} from "@/components/admin/types";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";
// 纯函数工具（无 server-only / 无 DB）：组合签名与后端共用同一实现，
// 大表内联编辑、商品表单、下单扣减三处的组合键完全一致（前后端数据打通）。
import { variantSignature } from "@/server/services/variant-stock";

const PRODUCT_STATUS_LABELS: Record<AdminProductStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "在售",
  ARCHIVED: "已归档",
};

const PRODUCT_STATUSES: AdminProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

const PAGE_SIZE = 10;

/**
 * 深链初值只读一次（大爷 2026-09-26 报障修复）：
 * 仪表盘「低库存」卡片直达 ?stock=low&status=ACTIVE。此前深链走 useEffect
 * 初始化：挂载先按默认值发出**无筛选请求 A**，effect 改 state 后再发**筛选请求 B**，
 * dev 下 A 首次触编译响应慢、A 后到覆盖 B 的结果 → 「点进来没有筛选结果」。
 * 现改为 useSearchParams 直读初值：首个 render 就带筛选，只发一个正确请求。
 * （防竞态守卫仍保留——用户快速手动切换筛选的覆盖问题与此无关、依然需要。）
 * useSearchParams 要求 Suspense 边界，包在外层壳组件。
 */
export default function AdminProductsPage() {
  return (
    <React.Suspense fallback={null}>
      <AdminProductsPageInner />
    </React.Suspense>
  );
}

function AdminProductsPageInner() {
  const t = useT();
  const searchParams = useSearchParams();

  const [rows, setRows] = React.useState<AdminProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  // 深链直达：?status=DRAFT|ACTIVE|ARCHIVED（仅首挂载读一次）
  const [statusFilter, setStatusFilter] = React.useState(() => {
    const s = searchParams.get("status");
    return s === "DRAFT" || s === "ACTIVE" || s === "ARCHIVED" ? s : "all";
  });
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  // 低库存筛选（与仪表盘计数同口径）+ 生效阈值（服务端随列表下发，后台可配）
  // 深链直达：?stock=low（仅首挂载读一次）
  const [stockFilter, setStockFilter] = React.useState(() =>
    searchParams.get("stock") === "low" ? "low" : "all",
  );
  const [lowStockThreshold, setLowStockThreshold] = React.useState(LOW_STOCK_THRESHOLD);

  const [categories, setCategories] = React.useState<AdminCategoryOption[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminProduct | null>(null);
  const [formSaving, setFormSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminProduct | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [batchLoading, setBatchLoading] = React.useState(false);

  const [stockEditId, setStockEditId] = React.useState<string | null>(null);
  const [stockValue, setStockValue] = React.useState("");
  // 列表请求序号（防竞态守卫，见 load 内注释）
  const loadSeq = React.useRef(0);
  // 组合矩阵（父组×子组组合粒度）的内联编辑状态：{ 组合签名: 库存字符串 }
  const [variantEditId, setVariantEditId] = React.useState<string | null>(null);
  const [variantEditValue, setVariantEditValue] = React.useState<Record<string, string>>({});
  // 弹层数据源：打开时实时拉取的最新商品（行数据是列表快照，可能过时）
  const [variantEditProduct, setVariantEditProduct] = React.useState<AdminProduct | null>(null);
  // 乐观锁快照（P1-1）：编辑开始时每组合的库存，保存时上送做锁内比对
  const variantExpectedRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, categoryFilter, stockFilter]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter !== "all") params.set("categoryId", categoryFilter);
    if (stockFilter !== "all") params.set("stock", stockFilter);
    setLoading(true);
    // 防竞态（大爷 2026-09-26 报障修复）：挂载时先用默认筛选发出请求 A，深链
    // effect 随后把 stockFilter 置为 low 再发请求 B —— dev 下 A 首次触编译响应
    // 慢、B 先回，A 后到时 setRows(全量) 会覆盖 B 的低库存结果，用户看到
    // 「点低库存卡片进来却没有筛选结果」。用户快速手动切换筛选同样会竞态。
    // 请求序号守卫：只接受最新一次请求的响应，过期响应一律丢弃。
    const seq = ++loadSeq.current;
    try {
      const res = await apiFetchRaw<AdminListResult<AdminProduct> & { lowStockThreshold?: number }>(
        `/api/admin/products?${params.toString()}`,
      );
      if (seq !== loadSeq.current) return; // 已被更新的请求取代，丢弃
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
      // 生效阈值随列表下发（后台可配）：红色高亮与筛选共用同一口径
      if (typeof res.lowStockThreshold === "number") setLowStockThreshold(res.lowStockThreshold);
      setSelected(new Set());
    } catch (err) {
      if (seq !== loadSeq.current) return;
      toast.error(err instanceof Error ? err.message : "加载商品失败");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, categoryFilter, stockFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    apiFetch<{ categories: AdminCategoryOption[] }>("/api/admin/categories")
      .then((res) => setCategories(Array.isArray(res?.categories) ? res.categories : []))
      .catch(() => setCategories([]));
  }, []);

  const categoryOptions = flattenCategoryTree(categories);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  };

  const batchStatus = async (status: AdminProductStatus) => {
    if (selected.size === 0) return;
    setBatchLoading(true);
    try {
      await apiFetch("/api/admin/products/batch-status", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected], status }),
      });
      toast.success(`已更新 ${selected.size} 个商品为「${PRODUCT_STATUS_LABELS[status]}」`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量更新失败");
    } finally {
      setBatchLoading(false);
    }
  };

  /** 批量删除（物理删除，与原站后台一致的强操作：二次确认 + 明示数量） */
  const batchDelete = async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    if (
      !window.confirm(
        `确认删除选中的 ${n} 个商品？\n\n删除后不可恢复（购物车中的对应商品会一并清理，历史订单保留快照）。`,
      )
    ) {
      return;
    }
    setBatchLoading(true);
    try {
      const res = await apiFetch<{ deleted: number }>("/api/admin/products/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected] }),
      });
      toast.success(`已删除 ${res.deleted ?? n} 个商品`);
      setSelected(new Set());
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量删除失败");
    } finally {
      setBatchLoading(false);
    }
  };

  const changeStatus = async (product: AdminProduct, status: AdminProductStatus) => {
    try {
      await apiFetch(`/api/admin/products/${product.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(`「${product.name}」已更新为「${PRODUCT_STATUS_LABELS[status]}」`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新状态失败");
    }
  };

  const startStockEdit = (product: AdminProduct) => {
    setStockEditId(product.id);
    setStockValue(String(product.stock));
    setVariantEditId(null);
  };

  const saveStock = async (product: AdminProduct) => {
    const n = Number(stockValue);
    if (!Number.isInteger(n) || n < 0) {
      toast.warning("库存必须为非负整数");
      return;
    }
    try {
      await apiFetch(`/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ stock: n }),
      });
      toast.success("库存已更新");
      setStockEditId(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新库存失败");
    }
  };

  // ── 多属性组合库存（大爷 2026-09-29 定稿，与商品编辑表单/下单/购物车同口径）──
  // 判定（不硬编码任何属性名）：商品有**任何规格数据**（variants / 可选属性组 /
  // specStock）→ 组合矩阵弹层；都没有 → 单规格商品，直接编辑总库存。
  //
  // 矩阵数据源（组/值完整并集，存量全兼容）：
  //   attributes 可选组（多值组默认可选，与表单/店面同口径）
  //   ∪ variants 组合里出现过的组/值
  //   ∪ specStock 维度池存量键（老数据；孤儿组不进矩阵）
  // 组合库存预填：variants（组合真相）→ specStock（组合内各维度取最小值，保守）
  //   → 0（没有任何数据的商品——如勾了父/子组但还没录过库存——弹层直接给出
  //   完整「父组×子组」矩阵让运营补录，保存即创建组合）。
  // 保存：PUT { variants: 全组合, specStock: null, attributes } —— 服务端把
  //   商品级 stock 重算为 Σ 组合，并清空维度池（两套模型互斥，杜绝「维度数字 ≠ 组合之和」）。

  /** 大表弹层的组合矩阵：组/值完整并集（attributes 添加顺序优先，第一组即父组） */
  const comboMatrixOf = (product: AdminProduct): { name: string; values: string[] }[] => {
    const groups = new Map<string, string[]>();
    const addValue = (name: unknown, value: unknown) => {
      if (typeof name !== "string" || typeof value !== "string") return;
      const n = name.trim();
      const v = value.trim();
      if (!n || !v) return;
      const list = groups.get(n) ?? [];
      if (!list.includes(v)) list.push(v);
      groups.set(n, list);
    };
    // 1) attributes 可选组（多值组默认可选，与表单/店面 parseAttributes 同口径）
    for (const a of product.attributes ?? []) {
      const selectable =
        a.selectable === true
          ? true
          : a.selectable === false
            ? false
            : Array.isArray(a.values) && a.values.length > 1;
      if (!selectable) continue;
      for (const v of a.values ?? []) addValue(a.name, v);
    }
    // 2) variants 组合里出现过的组/值（可能超出 attributes，保留可编辑）
    for (const v of product.variants ?? []) {
      for (const a of v.attributes ?? []) addValue(a.name, a.value);
    }
    // 3) specStock 维度池存量键（老数据；仅并入已出现的组，孤儿组不进矩阵）
    const spec = (product.specStock ?? {}) as Record<string, Record<string, number>>;
    for (const [name, values] of Object.entries(spec)) {
      if (!(name in groups)) continue; // 孤儿维度池组：无对应属性组，不进矩阵
      for (const v of Object.keys(values ?? {})) addValue(name, v);
    }
    return [...groups.entries()].map(([name, values]) => ({ name, values }));
  };

  /** 全组合 = 各属性组按添加顺序做笛卡尔积（父组在外层），与表单同构 */
  const comboCombosOf = (product: AdminProduct): { name: string; value: string }[][] => {
    const groups = comboMatrixOf(product);
    if (groups.length === 0) return [];
    return groups.reduce<{ name: string; value: string }[][]>(
      (acc, g) => acc.flatMap((combo) => g.values.map((v) => [...combo, { name: g.name, value: v }])),
      [[]],
    );
  };

  /** 组合的当前库存（预填口径）：variants 真相 → specStock 各维度最小值 → 0 */
  const comboStockOf = (
    product: AdminProduct,
    attrs: { name: string; value: string }[],
  ): number => {
    const variants = product.variants ?? [];
    if (variants.length > 0) {
      const sig = variantSignature(attrs);
      const v = variants.find((x) => variantSignature(x.attributes) === sig);
      return v ? Math.max(0, Math.floor(v.stock)) : 0;
    }
    const spec = product.specStock as Record<string, Record<string, number>> | null | undefined;
    const nums = attrs
      .map((a) => spec?.[a.name]?.[a.value])
      .filter((n): n is number => typeof n === "number");
    return nums.length === attrs.length && nums.length > 0
      ? Math.max(0, Math.floor(Math.min(...nums)))
      : 0;
  };

  /** 有任何规格数据的商品 → 组合矩阵弹层（单规格商品才直改总库存） */
  const hasSpecData = (product: AdminProduct) => comboMatrixOf(product).length > 0;

  /**
   * 打开组合矩阵弹层（大爷 2026-09-30 报障修复）：**先实时拉最新商品数据**。
   * 行数据是列表加载时的快照——页面开着期间有下单扣减/其他保存时快照过时，
   * expected ≠ 库内现值 → 一保存就 409（「入不了库」，实测死循环）。
   * 打开前 GET 详情，expected 与库内现值对齐，从源头消除这类 409；
   * 拉取失败用行数据兜底（保存时仍有乐观锁兜底，最坏 409 关闭弹层重开）。
   */
  const startVariantEdit = async (product: AdminProduct) => {
    setStockEditId(null);
    let fresh = product;
    try {
      const res = await apiFetch<{ product: AdminProduct }>(`/api/admin/products/${product.id}`);
      fresh = res.product;
    } catch {
      /* 拉取失败用行数据兜底 */
    }
    const init: Record<string, string> = {};
    // 乐观锁快照（P1-1 商用审计）：每个组合打开时的库存，保存时随 PUT 上送，
    // 服务端锁内与库内现值比对——不一致（期间有下单扣减）→ 409 拒绝保存
    const expected: Record<string, number> = {};
    for (const attrs of comboCombosOf(fresh)) {
      const stock = comboStockOf(fresh, attrs);
      init[variantSignature(attrs)] = String(stock);
      expected[variantSignature(attrs)] = stock;
    }
    variantExpectedRef.current = expected;
    setVariantEditValue(init);
    setVariantEditProduct(fresh);
    setVariantEditId(fresh.id);
  };

  /** 编辑中的总库存实时合计（= 各子组规格之和，保存前后同口径） */
  const variantEditTotal = React.useMemo(
    () =>
      Object.values(variantEditValue).reduce(
        (sum, str) => sum + Math.max(0, Math.floor(Number(str) || 0)),
        0,
      ),
    [variantEditValue],
  );

  /** 编辑中某父组值的实时合计（只读派生值：其名下全部子组组合之和） */
  const variantGroupEditTotal = (product: AdminProduct, groupName: string, groupValue: string) =>
    comboCombosOf(product)
      .filter((combo) => combo.some((a) => a.name === groupName && a.value === groupValue))
      .reduce(
        (sum, attrs) =>
          sum +
          Math.max(0, Math.floor(Number(variantEditValue[variantSignature(attrs)] ?? "0") || 0)),
        0,
      );

  const saveVariantStock = async (product: AdminProduct) => {
    const existing = product.variants ?? [];
    const variants = comboCombosOf(product).map((attrs) => {
      const key = variantSignature(attrs);
      // 已存组合保留覆盖价/SKU/组合图/上架状态（矩阵只管库存，不洗其它数据）；
      // expectedStock = 编辑开始时的快照（服务端锁内比对，防复活超卖）
      const saved = existing.find((v) => variantSignature(v.attributes) === key);
      return {
        attributes: attrs,
        stock: Math.max(0, Math.floor(Number(variantEditValue[key] ?? "0") || 0)),
        expectedStock: variantExpectedRef.current[key] ?? null,
        price: saved?.price ?? null,
        sku: saved?.sku ?? null,
        image: saved?.image ?? null,
        isActive: saved?.isActive ?? true,
      };
    });
    try {
      // 走商品复用 PUT：服务端行锁内做乐观锁比对 + diff 落库，把商品级 stock
      // 重算为 Σ 变体，并同步清空维度池 specStock（两套模型互斥）。
      await apiFetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify({
          variants,
          specStock: null,
          attributes: product.attributes ?? [],
        }),
      });
      toast.success("规格库存已更新");
      setVariantEditId(null);
      void load();
    } catch (err) {
      // 409 = 期间有下单扣减/其他编辑，expected 快照已过时 —— **必须关闭弹层并刷新
      // 行数据**（大爷 2026-09-30 实测）：弹层还开着的话 expectedRef 还是旧快照，
      // 再点保存永远 409（死循环，「入不了库」）；重新点开编辑时会拿到最新库存
      // （expected 随 startVariantEdit 重置）。
      if (err instanceof ApiClientError && err.status === 409) {
        setVariantEditId(null);
        void load();
      }
      toast.error(err instanceof Error ? err.message : "更新规格库存失败");
    }
  };

  /** 非编辑态的悬浮明细：按父组值聚合子组库存（运营不动鼠标即可核对） */
  const variantTooltipOf = (product: AdminProduct): string => {
    const groups = comboMatrixOf(product);
    const primary = groups[0];
    if (!primary) return "（无规格数据）";
    const combos = comboCombosOf(product);
    if (groups.length === 1) {
      return `${primary.name}：${primary.values
        .map((v) => `${v} ${comboStockOf(product, [{ name: primary.name, value: v }])}`)
        .join("、")}（点击编辑各规格库存）`;
    }
    return (
      primary.values
        .map((gv) => {
          const kids = combos.filter((combo) =>
            combo.some((a) => a.name === primary.name && a.value === gv),
          );
          const total = kids.reduce((s, attrs) => s + comboStockOf(product, attrs), 0);
          const detail = kids
            .map((attrs) => {
              const label =
                attrs
                  .filter((a) => a.name !== primary.name)
                  .map((a) => a.value)
                  .join(" / ") || "默认";
              return `${label} ${comboStockOf(product, attrs)}`;
            })
            .join("、");
          return `${primary.name}「${gv}」合计 ${total}（${detail}）`;
        })
        .join("；") + "（父组合计由子组决定，点击编辑）"
    );
  };

  const openEdit = async (product: AdminProduct) => {
    try {
      const res = await apiFetch<{ product: AdminProduct }>(`/api/admin/products/${product.id}`);
      setEditing(res.product);
      setFormOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载商品详情失败");
    }
  };

  const handleFormSubmit = async (payload: ProductFormPayload) => {
    setFormSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/admin/products/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("商品已更新");
      } else {
        await apiFetch("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("商品已创建");
      }
      setFormOpen(false);
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存商品失败");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/admin/products/${deleting.id}`, { method: "DELETE" });
      toast.success("商品已删除");
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除商品失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = selected.size > 0 && !allChecked;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Products")}
        description={t("Manage product info, stock and listing status")}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            新建商品
          </Button>
        }
      />

      {/* Toolbar — 紧凑 + 移动端换行 */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative min-w-0 flex-1 md:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索商品名称 / SKU"
                className="h-9 w-full pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full md:w-32">
                <SelectValue placeholder="所有状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有状态</SelectItem>
                {PRODUCT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PRODUCT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-full md:w-40">
                <SelectValue placeholder="所有分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有分类</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.depth > 0 ? `${"　".repeat(c.depth)}└ ` : ""}
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="h-9 w-full md:w-32">
                <SelectValue placeholder="全部库存" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部库存</SelectItem>
                <SelectItem value="low">低库存（库存 ≤ {lowStockThreshold}）</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden text-xs text-muted-foreground md:ml-auto md:block">
              共 {total} 个
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作条（选中时滑入，不挤原 toolbar） */}
      <BulkActionBar
        selectedCount={selected.size}
        onClear={() => setSelected(new Set())}
        actions={[
          { label: "上架", onClick: () => void batchStatus("ACTIVE"), loading: batchLoading },
          { label: "下架", onClick: () => void batchStatus("DRAFT"), loading: batchLoading },
          {
            label: "归档",
            onClick: () => void batchStatus("ARCHIVED"),
            loading: batchLoading,
          },
          {
            label: "删除",
            onClick: () => void batchDelete(),
            loading: batchLoading,
            destructive: true,
          },
        ]}
      />

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky-col-left w-12">
                  <Checkbox
                    checked={allChecked}
                    ref={(el) => {
                      if (el)
                        (el as unknown as HTMLButtonElement).dataset.indeterminate =
                          String(someChecked);
                    }}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                    aria-label="全选"
                  />
                </TableHead>
                <TableHead className="w-14">图</TableHead>
                <TableHead className="min-w-0">名称</TableHead>
                <TableHead className="hidden w-24 lg:table-cell">SKU</TableHead>
                <TableHead className="hidden min-w-0 md:table-cell">分类</TableHead>
                <TableHead className="w-24 text-right">价格</TableHead>
                <TableHead className="w-20">库存</TableHead>
                <TableHead className="hidden w-20 text-right xl:table-cell">已售</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="sticky-col-right w-20 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 10 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={<Search className="h-6 w-6" />}
                      title="暂无商品"
                      description='调整筛选条件，或点击"新建商品"来创建第一个商品'
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="sticky-col-left w-12">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => toggleSelected(row.id, Boolean(v))}
                        aria-label={`选择 ${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="w-14">
                      <ImageWithFallback
                        src={row.images && row.images.length > 0 ? row.images[0] : undefined}
                        alt={row.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md border object-cover"
                      />
                    </TableCell>
                    <TableCell>
                      <CellText value={row.name} className="font-medium" />
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      <CellText value={row.sku} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      <CellText value={row.category?.name ?? "-"} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.price, "USD")}
                    </TableCell>
                    {/* relative 作浮层锚点：编辑面板 absolute 展开，不挤表格、不压相邻列 */}
                    <TableCell className="relative">
                      {hasSpecData(row) ? (
                        /* 有规格数据的商品（大爷 2026-09-29）：第一个添加的属性组 = 父组，
                           其余 = 子组。库存数字只读展示（= Σ 子组组合，服务端保证），
                           铅笔展开组合矩阵内联编辑各子组规格，父组合计与总库存实时联动、只读。
                           存量商品（无变体、只有维度池/属性组）同样进矩阵：预填存量数据，
                           保存即创建组合 —— 与商品编辑表单同一套逻辑。 */
                        variantEditId === row.id ? (
                          /* 编辑浮层：absolute 脱离文档流 —— 不撑单元格、实底+阴影
                             完整盖住下层，杜绝「面板边缘切在相邻列数字中间」的叠字 */
                          <div className="absolute left-0 top-1/2 z-30 min-w-64 max-w-80 -translate-y-1/2 space-y-2 rounded-md border bg-card p-2 shadow-popover">
                            {(() => {
                              const editSource = variantEditProduct ?? row;
                              const groups = comboMatrixOf(editSource);
                              const primary = groups[0];
                              const groupable = groups.length > 1;
                              if (!primary) return null;
                              const combos = comboCombosOf(editSource);
                              // 子格渲染：库存框 + 规格名（单属性组=规格值本身；多组=其余维度拼接）
                              const renderKid = (
                                attrs: { name: string; value: string }[],
                                gv: string,
                              ) => {
                                const label = groupable
                                  ? attrs
                                      .filter((a) => a.name !== primary.name)
                                      .map((a) => a.value)
                                      .join(" / ") || "默认"
                                  : attrs.map((a) => a.value).join(" / ");
                                const key = variantSignature(attrs);
                                return (
                                  <label
                                    key={key}
                                    className="flex items-center gap-1 text-[11px] leading-6"
                                  >
                                    <span className="text-muted-foreground">{label}</span>
                                    <Input
                                      inputMode="numeric"
                                      value={variantEditValue[key] ?? ""}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, "");
                                        setVariantEditValue((prev) => ({
                                          ...prev,
                                          [key]: val,
                                        }));
                                      }}
                                      className="h-6 w-10 px-1 text-center text-xs tabular-nums"
                                      aria-label={`${gv} ${label} 库存`}
                                    />
                                  </label>
                                );
                              };
                              // 单属性组：每个规格值自身就是一个组合，平铺一行（横向换行）
                              if (!groupable) {
                                return (
                                  <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                                    {combos.map((attrs) => renderKid(attrs, attrs[0]?.value ?? ""))}
                                  </div>
                                );
                              }
                              // 多属性组：按父组取值分卡片 —— 卡片头「父组名：值 + 只读合计」，
                              // 组内子组规格横排；父组合计由子格决定（不能手写）
                              return primary.values.map((gv) => {
                                const kids = combos.filter((combo) =>
                                  combo.some(
                                    (a) => a.name === primary.name && a.value === gv,
                                  ),
                                );
                                if (kids.length === 0) return null;
                                return (
                                  <div key={gv} className="space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="font-medium">
                                        {primary.name}：{gv}
                                      </span>
                                      <span className="text-muted-foreground">
                                        合计{" "}
                                        <span className="font-medium tabular-nums text-foreground">
                                          {variantGroupEditTotal(editSource, primary.name, gv)}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                                      {kids.map((attrs) => renderKid(attrs, gv))}
                                    </div>
                                  </div>
                                );
                              });
                            })()}                            <div className="flex items-center justify-between border-t pt-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                总库存{" "}
                                <span className="font-medium tabular-nums text-foreground">
                                  {variantEditTotal}
                                </span>
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-xs"
                                  onClick={() => void saveVariantStock(variantEditProduct ?? row)}
                                >
                                  保存
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-xs"
                                  onClick={() => setVariantEditId(null)}
                                >
                                  取消
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label="编辑规格库存"
                            onClick={() => void startVariantEdit(row)}
                            title={variantTooltipOf(row)}
                            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm transition-colors hover:bg-muted"
                          >
                            <span
                              className={
                                row.stock <= lowStockThreshold
                                  ? "font-medium tabular-nums text-destructive"
                                  : "tabular-nums"
                              }
                            >
                              {row.stock}
                            </span>
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )
                      ) : /* 单规格：直接改总库存数字 */
                      stockEditId === row.id ? (
                        /* 编辑浮层：absolute 脱离文档流，实底+阴影完整盖住下层 ——
                           按钮 icon 化收窄面板，避免边缘切进「已售」列数字造成叠字 */
                        <div className="absolute left-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-card p-1 shadow-popover">
                          <Input
                            value={stockValue}
                            onChange={(e) => setStockValue(e.target.value)}
                            className="h-7 w-14 border-input px-1 text-sm tabular-nums"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveStock(row);
                              if (e.key === "Escape") setStockEditId(null);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-primary"
                            title="保存（Enter）"
                            aria-label="保存"
                            onClick={() => void saveStock(row)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            title="取消（Esc）"
                            aria-label="取消"
                            onClick={() => setStockEditId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="编辑库存"
                          onClick={() => startStockEdit(row)}
                          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm transition-colors hover:bg-muted"
                        >
                          <span
                            className={
                              row.stock <= lowStockThreshold
                                ? "font-medium tabular-nums text-destructive"
                                : "tabular-nums"
                            }
                          >
                            {row.stock}
                          </span>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">
                      {row.soldCount}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label="更改状态" className="cursor-pointer">
                            <StatusBadge
                              status={row.status}
                              labelMap={{ DRAFT: "草稿", ACTIVE: "已上架", ARCHIVED: "已归档" }}
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {PRODUCT_STATUSES.map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => void changeStatus(row, s)}
                              className={s === row.status ? "text-primary" : undefined}
                            >
                              {PRODUCT_STATUS_LABELS[s]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="sticky-col-right w-16 text-right">
                      <DataTableActions
                        actions={[
                          { label: "编辑", icon: Pencil, onClick: () => void openEdit(row) },
                          {
                            label: "删除",
                            icon: Trash2,
                            onClick: () => setDeleting(row),
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

      {/* Pagination + 总数 */}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {total > 0 ? `共 ${total} 个商品，第 ${page} / ${totalPages || 1} 页` : ""}
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑商品" : "新建商品"}</DialogTitle>
            <DialogDescription>
              {editing ? `正在编辑：${editing.name}` : "带 * 为必填项"}
            </DialogDescription>
          </DialogHeader>
          {formOpen ? (
            <ProductForm
              key={editing?.id ?? "create"}
              initial={editing}
              categories={categories}
              loading={formSaving}
              onSubmit={handleFormSubmit}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !deleteLoading && setDeleting(v ? deleting : null)}
        title="删除商品"
        description={deleting ? `确认删除商品「${deleting.name}」？此操作不可撤销。` : ""}
        confirmText="删除"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

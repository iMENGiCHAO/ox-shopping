"use client";

import * as React from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
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

const PRODUCT_STATUS_LABELS: Record<AdminProductStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "在售",
  ARCHIVED: "已归档",
};

const PRODUCT_STATUSES: AdminProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

const PAGE_SIZE = 10;

export default function AdminProductsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminProduct[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  // 低库存筛选（与仪表盘计数同口径）+ 生效阈值（服务端随列表下发，后台可配）
  const [stockFilter, setStockFilter] = React.useState("all");
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
  // 多规格商品的规格明细库存内联编辑状态
  const [specEditId, setSpecEditId] = React.useState<string | null>(null);
  const [specEditValue, setSpecEditValue] = React.useState<Record<string, Record<string, string>>>(
    {},
  );

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // 深链初始化（仪表盘「低库存」信号直达 ?stock=low&status=ACTIVE）：仅首挂载读一次 URL
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("stock") === "low") setStockFilter("low");
    const s = sp.get("status");
    if (s === "DRAFT" || s === "ACTIVE" || s === "ARCHIVED") setStatusFilter(s);
  }, []);

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
    try {
      const res = await apiFetchRaw<AdminListResult<AdminProduct> & { lowStockThreshold?: number }>(
        `/api/admin/products?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
      // 生效阈值随列表下发（后台可配）：红色高亮与筛选共用同一口径
      if (typeof res.lowStockThreshold === "number") setLowStockThreshold(res.lowStockThreshold);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载商品失败");
    } finally {
      setLoading(false);
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

  // 规格编辑面板的实时合计：改各规格明细时立刻看到总库存变化
  const specEditTotal = React.useMemo(
    () =>
      Object.values(specEditValue).reduce(
        (sum, m) => sum + Object.values(m).reduce((s, n) => s + (Number(n) || 0), 0),
        0,
      ),
    [specEditValue],
  );

  const startStockEdit = (product: AdminProduct) => {
    setStockEditId(product.id);
    setStockValue(String(product.stock));
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

  // ── 多规格商品：规格明细库存（颜色/尺码逐项）──
  const hasSpecStock = (product: AdminProduct) =>
    !!product.specStock &&
    typeof product.specStock === "object" &&
    Object.keys(product.specStock as object).length > 0;

  /** 解析规格组：以 specStock 的组为准，值优先取 attributes 里的完整值列表 */
  const specGroupsOf = (product: AdminProduct): { name: string; values: string[] }[] => {
    const spec = product.specStock as Record<string, Record<string, number>> | null | undefined;
    if (!spec || typeof spec !== "object") return [];
    const attrMap = new Map<string, string[]>();
    for (const a of product.attributes ?? []) {
      if (a.name && Array.isArray(a.values)) attrMap.set(a.name, a.values);
    }
    return Object.entries(spec)
      .map(([name, m]) => ({ name, values: attrMap.get(name) ?? Object.keys(m ?? {}) }))
      .filter((g) => g.values.length > 0);
  };

  const startSpecEdit = (product: AdminProduct) => {
    const spec = product.specStock as Record<string, Record<string, number>> | null;
    const init: Record<string, Record<string, string>> = {};
    for (const g of specGroupsOf(product)) {
      init[g.name] = {};
      for (const v of g.values) init[g.name]![v] = String(spec?.[g.name]?.[v] ?? 0);
    }
    setSpecEditValue(init);
    setSpecEditId(product.id);
  };

  const saveSpecStock = async (product: AdminProduct) => {
    const specStock: Record<string, Record<string, number>> = {};
    for (const [name, m] of Object.entries(specEditValue)) {
      specStock[name] = {};
      for (const [v, str] of Object.entries(m)) {
        const n = Number(str);
        specStock[name]![v] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
      }
    }
    try {
      // 走商品复用 PUT：服务端会用 aggregateTrackedStock 重算总库存，保持 stock 与规格明细一致
      await apiFetch(`/api/admin/products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify({ specStock, attributes: product.attributes ?? [] }),
      });
      toast.success("规格库存已更新");
      setSpecEditId(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新规格库存失败");
    }
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
                    <TableCell>
                      {hasSpecStock(row) ? (
                        /* 多规格：显示各规格明细，点击铅笔展开内联编辑每个颜色/尺码的库存 */
                        specEditId === row.id ? (
                          <div className="min-w-44 space-y-2 rounded border bg-muted/40 p-2">
                            {specGroupsOf(row).map((g) => (
                              <div key={g.name} className="space-y-1">
                                <div className="text-[11px] font-medium text-muted-foreground">
                                  {g.name}
                                </div>
                                <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                                  {g.values.map((v) => (
                                    <label
                                      key={v}
                                      className="flex items-center gap-1 text-[11px] leading-6"
                                    >
                                      <span className="text-muted-foreground">{v}</span>
                                      <Input
                                        inputMode="numeric"
                                        value={specEditValue[g.name]?.[v] ?? ""}
                                        onChange={(e) => {
                                          const val = e.target.value.replace(/[^0-9]/g, "");
                                          setSpecEditValue((prev) => ({
                                            ...prev,
                                            [g.name]: { ...(prev[g.name] ?? {}), [v]: val },
                                          }));
                                        }}
                                        className="h-6 w-10 px-1 text-center text-xs tabular-nums"
                                        aria-label={`${g.name}:${v}库存`}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                            <div className="flex items-center justify-between border-t pt-1.5">
                              <span className="text-[11px] text-muted-foreground">
                                合计{" "}
                                <span className="font-medium tabular-nums text-foreground">
                                  {specEditTotal}
                                </span>
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-xs"
                                  onClick={() => void saveSpecStock(row)}
                                >
                                  保存
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-xs"
                                  onClick={() => setSpecEditId(null)}
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
                            onClick={() => startSpecEdit(row)}
                            title={
                              specGroupsOf(row)
                                .map((g) => {
                                  const m =
                                    (
                                      row.specStock as Record<string, Record<string, number>> | null
                                    )?.[g.name] ?? {};
                                  return `${g.name}：${g.values.map((v) => `${v} ${m[v] ?? 0}`).join("、")}`;
                                })
                                .join("；") + "（点击编辑各规格库存）"
                            }
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
                      ) : /* 单品：直接改总库存数字 */
                      stockEditId === row.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={stockValue}
                            onChange={(e) => setStockValue(e.target.value)}
                            className="h-7 w-16 px-1 text-sm tabular-nums"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveStock(row);
                              if (e.key === "Escape") setStockEditId(null);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1.5 text-xs"
                            onClick={() => void saveStock(row)}
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1.5 text-xs"
                            onClick={() => setStockEditId(null)}
                          >
                            取消
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

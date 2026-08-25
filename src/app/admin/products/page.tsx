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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
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

const PRODUCT_STATUS_LABELS: Record<AdminProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
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

  // debounced search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // reset to page 1 on filter change
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, categoryFilter]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter !== "all") params.set("categoryId", categoryFilter);
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<AdminProduct>>(
        `/api/admin/products?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, categoryFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // category options (filter + form)
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
    if (selected.size === 0) {
      toast.warning(t("Please select products first"));
      return;
    }
    setBatchLoading(true);
    try {
      await apiFetch("/api/admin/products/batch-status", {
        method: "POST",
        body: JSON.stringify({ ids: [...selected], status }),
      });
      toast.success(t('Updated {n} product(s) to "{status}"').replace("{n}", String(selected.size)).replace("{status}", t(PRODUCT_STATUS_LABELS[status])));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
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
      toast.success(t('"{name}" updated to "{status}"').replace("{name}", product.name).replace("{status}", t(PRODUCT_STATUS_LABELS[status])));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const startStockEdit = (product: AdminProduct) => {
    setStockEditId(product.id);
    setStockValue(String(product.stock));
  };

  const saveStock = async (product: AdminProduct) => {
    const n = Number(stockValue);
    if (!Number.isInteger(n) || n < 0) {
      toast.warning(t("Stock must be a non-negative integer"));
      return;
    }
    try {
      await apiFetch(`/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ stock: n }),
      });
      toast.success(t("Stock updated"));
      setStockEditId(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update stock");
    }
  };

  const openEdit = async (product: AdminProduct) => {
    try {
      const res = await apiFetch<{ product: AdminProduct }>(`/api/admin/products/${product.id}`);
      setEditing(res.product);
      setFormOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load product details");
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
        toast.success(t("Product updated"));
      } else {
        await apiFetch("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(t("Product created"));
      }
      setFormOpen(false);
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/admin/products/${deleting.id}`, { method: "DELETE" });
      toast.success(t("Product deleted"));
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeleteLoading(false);
    }
  };

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Products")}
        description={t("Manage product info, stock and listing status")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("New Product")}
          </Button>
        }
      />

      {/* Toolbar */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SearchProductName / SKU"
                className="h-10 w-64 pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t("All statuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PRODUCT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(PRODUCT_STATUS_LABELS[s])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("All categories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.depth > 0 ? `${"　".repeat(c.depth)}└ ` : ""}
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selected.size > 0 ? `Selected ${selected.size} items` : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={batchLoading}
                onClick={() => void batchStatus("ACTIVE")}
              >
                Activate all
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={batchLoading}
                onClick={() => void batchStatus("DRAFT")}
              >
                Deactivate all
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={batchLoading}
                onClick={() => void batchStatus("ARCHIVED")}
              >
                Archive all
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                    aria-label={t("Select all")}
                  />
                </TableHead>
                <TableHead className="w-16">{t("Image")}</TableHead>
                <TableHead>{t("Name")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("SKU")}</TableHead>
                <TableHead>{t("Category")}</TableHead>
                <TableHead>{t("Price")}</TableHead>
                <TableHead className="w-28">{t("Stock")}</TableHead>
                <TableHead className="hidden xl:table-cell w-16">{t("Sold")}</TableHead>
                <TableHead className="w-28">{t("Status")}</TableHead>
                <TableHead className="w-32 text-right">{t("Actions")}</TableHead>
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
                      title={t("No products yet")}
                      description='Adjust filters, or click "New Product" to create your first product'
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => toggleSelected(row.id, Boolean(v))}
                        aria-label={`Select ${row.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <ImageWithFallback
                        src={row.images && row.images.length > 0 ? row.images[0] : undefined}
                        alt={row.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md border"
                      />
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="truncate font-medium" title={row.name}>
                        {row.name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs lg:table-cell">{row.sku}</TableCell>
                    <TableCell className="max-w-[120px] truncate">
                      {row.category?.name ?? "-"}
                    </TableCell>
                    <TableCell className="font-medium">{formatMoney(row.price)}</TableCell>
                    <TableCell>
                      {stockEditId === row.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={stockValue}
                            onChange={(e) => setStockValue(e.target.value)}
                            className="h-8 w-16"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveStock(row);
                              if (e.key === "Escape") setStockEditId(null);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => void saveStock(row)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={row.stock <= 5 ? "text-destructive" : ""}>
                            {row.stock}
                          </span>
                          <button
                            type="button"
                            aria-label={t("Edit stock")}
                            onClick={() => startStockEdit(row)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">{row.soldCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" aria-label={t("Change status")}>
                            <StatusBadge
                              status={row.status}
                              labelMap={{ DRAFT: t("Draft"), ACTIVE: t("Active"), ARCHIVED: t("Archived") }}
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
                              {t(PRODUCT_STATUS_LABELS[s])}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => void openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("Edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(row)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("Delete")}
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

      {/* Pagination */}
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t("Edit Product") : t("New Product")}</DialogTitle>
            <DialogDescription>
              {editing ? `${t("Editing")}: ${editing.name}` : t("Fields marked * are required")}
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
        title={t("Delete product")}
        description={deleting ? t('Are you sure you want to delete product "{name}"? This action cannot be undone.').replace("{name}", deleting.name) : ""}
        confirmText={t("Delete")}
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

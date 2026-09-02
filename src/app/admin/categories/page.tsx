"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronRight, FolderTree, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { ImageUploader } from "@/components/admin/image-uploader";
import {
  collectNodeAndDescendants,
  flattenCategoryTree,
} from "@/components/admin/category-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
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
import type { AdminCategory } from "@/components/admin/types";
import { CellText } from "@/components/admin/cell-text";

import { useT } from "@/components/admin/lang-provider";
/** generate slug from name (lowercase alphanumeric + hyphens only) */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const categoryFormSchema = z
  .object({
    name: z.string().trim().min(2, "分类名称至少 2 个字符").max(50),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "路径标识只能包含小写字母、数字与连字符")
      .max(100)
      .optional()
      .or(z.literal("")),
    description: z.string().max(500).optional().or(z.literal("")),
    image: z
      .string()
      .max(2048)
      .refine(
        (v) => v === "" || /^https?:\/\//.test(v) || v.startsWith("/"),
        "请填写合法的图片 URL（http/https）或站内路径",
      )
      .optional()
      .or(z.literal("")),
    bannerImage: z
      .string()
      .max(2048)
      .refine(
        (v) => v === "" || /^https?:\/\//.test(v) || v.startsWith("/"),
        "请填写合法的图片 URL（http/https）或站内路径",
      )
      .optional()
      .or(z.literal("")),
    parentId: z.string().optional().or(z.literal("")),
    sortOrder: z.string().min(1, "请填写排序值"),
    isActive: z.boolean().default(true),
  })
  .refine((d) => Number.isInteger(Number(d.sortOrder)), {
    message: "排序值必须为整数",
    path: ["sortOrder"],
  });

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

/** recursively find a category node */
function findCategory(tree: AdminCategory[], id: string): AdminCategory | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children && node.children.length > 0) {
      const found = findCategory(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** get a node siblings (including self) */
function getSiblings(tree: AdminCategory[], node: AdminCategory): AdminCategory[] {
  if (!node.parentId) return tree;
  const parent = findCategory(tree, node.parentId);
  return parent?.children ?? [];
}

export default function AdminCategoriesPage() {
  const t = useT();

  const [tree, setTree] = React.useState<AdminCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminCategory | null>(null);
  const [formSaving, setFormSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminCategory | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [reorderLoading, setReorderLoading] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ categories: AdminCategory[] }>("/api/admin/categories");
      const list = Array.isArray(res?.categories) ? res.categories : [];
      setTree(list);
      // expand all by default
      const ids = new Set<string>();
      const walk = (nodes: AdminCategory[]) => {
        for (const n of nodes) {
          if (n.children && n.children.length > 0) {
            ids.add(n.id);
            walk(n.children);
          }
        }
      };
      walk(list);
      setExpanded(ids);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载分类失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      image: "",
      parentId: "",
      sortOrder: "0",
      isActive: true,
    },
  });

  // prefill when opening the create/edit dialog
  React.useEffect(() => {
    if (!formOpen) return;
    setSlugTouched(Boolean(editing));
    form.reset({
      name: editing?.name ?? "",
      slug: editing?.slug ?? "",
      description: editing?.description ?? "",
      image: editing?.image ?? "",
      bannerImage: editing?.bannerImage ?? "",
      parentId: editing?.parentId ?? "",
      sortOrder: String(editing?.sortOrder ?? 0),
      isActive: editing?.isActive ?? true,
    });
  }, [formOpen, editing, form]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** move up/down: collect sibling orderedIds and call reorder API */
  const move = async (node: AdminCategory, dir: -1 | 1) => {
    const siblings = getSiblings(tree, node);
    const index = siblings.findIndex((s) => s.id === node.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= siblings.length) {
      toast.warning(t("Already at the boundary"));
      return;
    }
    const next = [...siblings];
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    setReorderLoading(true);
    try {
      await apiFetch("/api/admin/categories/reorder", {
        method: "PUT",
        body: JSON.stringify({ orderedIds: next.map((s) => s.id) }),
      });
      toast.success(t("Sort order updated"));
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新排序失败");
    } finally {
      setReorderLoading(false);
    }
  };

  const toggleActive = async (node: AdminCategory, isActive: boolean) => {
    try {
      await apiFetch(`/api/admin/categories/${node.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      toast.success(isActive ? "已启用分类" : "已停用分类");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新分类状态失败");
    }
  };

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setFormSaving(true);
    const payload = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description || null,
      image: values.image || null,
      bannerImage: values.bannerImage || null,
      parentId: values.parentId || null,
      sortOrder: Number(values.sortOrder),
      isActive: values.isActive,
    };
    try {
      if (editing) {
        await apiFetch(`/api/admin/categories/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success(t("Category updated"));
      } else {
        await apiFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success(t("Category created"));
      }
      setFormOpen(false);
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存分类失败");
    } finally {
      setFormSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/admin/categories/${deleting.id}`, { method: "DELETE" });
      toast.success(t("Category deleted"));
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除分类失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const excludedIds = editing ? collectNodeAndDescendants(tree, editing.id) : [];
  const parentOptions = flattenCategoryTree(tree).filter(
    (c) => !excludedIds.includes(c.id) && (!editing || c.id !== editing.id),
  );

  const renderRows = (nodes: AdminCategory[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isOpen = expanded.has(node.id);
      const parent = node.parentId ? findCategory(tree, node.parentId) : null;
      return (
        <React.Fragment key={node.id}>
          <TableRow className={depth > 0 ? "bg-muted/20" : undefined}>
            <TableCell className="w-12">
              {node.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={node.image}
                  alt={node.name}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                  <FolderTree className="h-4 w-4" />
                </div>
              )}
            </TableCell>
            <TableCell className="min-w-0">
              <div
                className="flex items-center gap-1"
                style={{ paddingLeft: depth * 24 }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.id)}
                    aria-label={isOpen ? "收起" : "展开"}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span className="inline-block w-4 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <CellText
                    value={
                      <span className="font-medium">
                        {node.name}
                        {depth === 0 && hasChildren ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({node.children?.length ?? 0})
                          </span>
                        ) : null}
                      </span>
                    }
                    className="font-medium"
                  />
                </div>
              </div>
            </TableCell>
            <TableCell className="w-[160px]">
              <CellText
                value={node.slug}
                className="font-mono text-xs"
                title={node.slug}
              />
            </TableCell>
            <TableCell className="w-[140px]">
              <CellText
                value={parent?.name ?? (node.parentId ? `…${node.parentId.slice(-6)}` : "—")}
                className="text-muted-foreground"
              />
            </TableCell>
            <TableCell className="w-16 text-right tabular-nums">{node.sortOrder}</TableCell>
            <TableCell className="w-20">
              <Switch
                checked={node.isActive}
                onCheckedChange={(v) => void toggleActive(node, v)}
                aria-label={`切换 ${node.name} 的启用状态`}
              />
            </TableCell>
            <TableCell className="sticky-col-right w-[180px]">
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={reorderLoading}
                  aria-label={t("Move up")}
                  onClick={() => void move(node, -1)}
                >
                  <ChevronRight className="h-4 w-4 -rotate-90" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={reorderLoading}
                  aria-label={t("Move down")}
                  onClick={() => void move(node, 1)}
                >
                  <ChevronRight className="h-4 w-4 rotate-90" />
                </Button>
                <DataTableActions
                  actions={[
                    {
                      label: t("Edit"),
                      icon: Pencil,
                      onClick: () => {
                        setEditing(node);
                        setFormOpen(true);
                      },
                      primary: true,
                    },
                    {
                      label: t("Delete"),
                      icon: Trash2,
                      onClick: () => setDeleting(node),
                      destructive: true,
                      divider: true,
                    },
                  ]}
                />
              </div>
            </TableCell>
          </TableRow>
          {hasChildren && isOpen ? renderRows(node.children, depth + 1) : null}
        </React.Fragment>
      );
    });

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("Categories")}
        description={t("Manage product category hierarchy, ordering and active state")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("New Category")}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">图标</TableHead>
                <TableHead className="min-w-0">{t("Name")}</TableHead>
                <TableHead className="w-[140px]">路径标识</TableHead>
                <TableHead className="w-[140px]">{t("Parent Category")}</TableHead>
                <TableHead className="w-20 text-right">{t("Sort")}</TableHead>
                <TableHead className="w-24">{t("Status")}</TableHead>
                <TableHead className="sticky-col-right w-[180px] text-right">
                  {t("Actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : tree.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={<FolderTree className="h-6 w-6" />}
                      title={t("No categories yet")}
                      description='点击"新增分类"来创建你的第一个商品分类'
                    />
                  </TableCell>
                </TableRow>
              ) : (
                renderRows(tree, 0)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            <DialogTitle>{t(editing ? "Edit Category" : "New Category")}</DialogTitle>
            <DialogDescription>
              {editing ? `正在编辑：${editing.name}` : t("Fields marked * are required")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">分类名称 *</Label>
              <Input
                id="cat-name"
                placeholder="例如 手机"
                {...form.register("name", {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    if (!slugTouched) {
                      const slug = slugify(e.target.value);
                      if (slug) form.setValue("slug", slug);
                    }
                  },
                })}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-slug">
                路径标识 {editing ? "（编辑时通常不修改）" : "（按名称自动生成，可手动调整）"}
              </Label>
              <Input
                id="cat-slug"
                placeholder="例如 mobile-phones"
                {...form.register("slug", {
                  onChange: () => setSlugTouched(true),
                })}
              />
              {form.formState.errors.slug ? (
                <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-parent">{t("Parent Category")}</Label>
              <Select
                value={form.watch("parentId") || "none"}
                onValueChange={(v) => form.setValue("parentId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="cat-parent">
                  <SelectValue placeholder={t("None (top-level)")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("None (top-level)")}</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.depth > 0 ? `${"　".repeat(c.depth)}└ ` : ""}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.parentId ? (
                <p className="text-xs text-destructive">{form.formState.errors.parentId.message}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cat-sort">{t("Sort")}</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  placeholder="0"
                  {...form.register("sortOrder")}
                />
                {form.formState.errors.sortOrder ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.sortOrder.message}
                  </p>
                ) : null}
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Label htmlFor="cat-active" className="shrink-0">
                  启用
                </Label>
                <Switch
                  id="cat-active"
                  checked={form.watch("isActive")}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-image">分类图片（可选，可上传或粘贴 URL）</Label>
              <ImageUploader
                value={form.watch("image") ? [form.watch("image")!] : []}
                onChange={(urls) =>
                  form.setValue("image", urls[0] ?? "", { shouldValidate: true })
                }
                max={1}
              />
              <Input id="cat-image" placeholder="https://..." {...form.register("image")} />
              {form.formState.errors.image ? (
                <p className="text-xs text-destructive">{form.formState.errors.image.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-banner">大横幅（分类落地页顶部全宽图；前两个分类也用作首页横幅）</Label>
              <ImageUploader
                value={form.watch("bannerImage") ? [form.watch("bannerImage")!] : []}
                onChange={(urls) =>
                  form.setValue("bannerImage", urls[0] ?? "", { shouldValidate: true })
                }
                max={1}
              />
              <Input id="cat-banner" placeholder="https://..." {...form.register("bannerImage")} />
              {form.formState.errors.bannerImage ? (
                <p className="text-xs text-destructive">{form.formState.errors.bannerImage.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">{t("Description")}（可选）</Label>
              <Textarea
                id="cat-desc"
                rows={3}
                placeholder={t("Category description")}
                {...form.register("description")}
              />
              {form.formState.errors.description ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.description.message}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={formSaving}
              >
                取消
              </Button>
              <Button type="submit" disabled={formSaving}>
                {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t(editing ? "Save changes" : "Create category")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !deleteLoading && setDeleting(v ? deleting : null)}
        title={t("Delete category")}
        description={
          deleting
            ? `确定要删除分类"${deleting.name}"吗？其下子分类将提升为顶级分类。此操作无法撤销。`
            : ""
        }
        confirmText={t("Delete")}
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

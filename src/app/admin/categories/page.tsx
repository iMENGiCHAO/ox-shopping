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
import { ImageUploader } from "@/components/admin/image-uploader";
import {
  categoryProductCount,
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
    name: z.string().trim().min(2, "Category name must be at least 2 characters").max(50),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, digits and hyphens")
      .max(100)
      .optional()
      .or(z.literal("")),
    description: z.string().max(500).optional().or(z.literal("")),
    image: z
      .string()
      .max(2048)
      .refine((v) => v === "" || /^https?:\/\//.test(v), "Please enter a valid image URL (http/https)")
      .optional()
      .or(z.literal("")),
    parentId: z.string().optional().or(z.literal("")),
    sortOrder: z.string().min(1, "Please enter a sort order"),
    isActive: z.boolean().default(true),
  })
  .refine((d) => Number.isInteger(Number(d.sortOrder)), {
    message: "Sort order must be an integer",
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
      toast.error(err instanceof Error ? err.message : "Failed to load categories");
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
      toast.error(err instanceof Error ? err.message : "Failed to update sort order");
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
      toast.success(isActive ? "Category enabled" : "Category disabled");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update category status");
    }
  };

  const handleFormSubmit = form.handleSubmit(async (values) => {
    setFormSaving(true);
    const payload = {
      name: values.name,
      slug: values.slug || undefined,
      description: values.description || null,
      image: values.image || null,
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
      toast.error(err instanceof Error ? err.message : "Failed to save category");
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
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
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
      return (
        <React.Fragment key={node.id}>
          <TableRow className={depth > 0 ? "bg-muted/20" : undefined}>
            <TableCell>
              <div className="flex items-center gap-1" style={{ paddingLeft: depth * 24 }}>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(node.id)}
                    aria-label={isOpen ? "Collapse" : "Expand"}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span className="inline-block w-4" />
                )}
                <span className="font-medium">{node.name}</span>
                {depth === 0 && hasChildren ? (
                  <span className="text-xs text-muted-foreground">
                    ({node.children?.length ?? 0}  subcategories)
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">{node.slug}</TableCell>
            <TableCell>{categoryProductCount(node)}</TableCell>
            <TableCell className="text-muted-foreground">{node.sortOrder}</TableCell>
            <TableCell>
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
              </div>
            </TableCell>
            <TableCell>
              <Switch
                checked={node.isActive}
                onCheckedChange={(v) => void toggleActive(node, v)}
                aria-label={`toggle ${node.name}  active state`}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => {
                    setEditing(node);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("Edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-destructive hover:text-destructive"
                  onClick={() => setDeleting(node)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("Delete")}
                </Button>
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
            New Category
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{t("Name")}</TableHead>
                <TableHead>slug</TableHead>
                <TableHead className="w-20">{t("Products")}</TableHead>
                <TableHead className="w-20">{t("Sort")}</TableHead>
                <TableHead className="w-24">Reorder</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-36 text-right">{t("Actions")}</TableHead>
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
                      description='Click "New Category" to create your first product category'
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
              {editing ? `Editing: ${editing.name}` : "Fields marked * are required"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Category name *</Label>
              <Input
                id="cat-name"
                placeholder="e.g. Mobile"
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
                slug {editing ? "(usually unchanged when editing)" : "(auto-generated from name, editable)"}
              </Label>
              <Input
                id="cat-slug"
                placeholder="e.g. mobile-phones"
                {...form.register("slug", {
                  onChange: () => setSlugTouched(true),
                })}
              />
              {form.formState.errors.slug ? (
                <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent category</Label>
              <Select
                value={form.watch("parentId") || "none"}
                onValueChange={(v) => form.setValue("parentId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="cat-parent">
                  <SelectValue placeholder="None (top level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top level)</SelectItem>
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
                <Label htmlFor="cat-sort">Sort</Label>
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
                  Active
                </Label>
                <Switch
                  id="cat-active"
                  checked={form.watch("isActive")}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-image">Category image (optional — upload or paste URL)</Label>
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
              <Label htmlFor="cat-desc">Description (optional)</Label>
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
                Cancel
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
            ? `Are you sure you want to delete category"${deleting.name}"? Its child categories will be promoted to top level. This action cannot be undone.`
            : ""
        }
        confirmText="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

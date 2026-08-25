import type { AdminCategoryFlat, AdminCategoryOption } from "@/components/admin/types";

/** 分类树 → 扁平选项列表(含层级缩进信息)，用于 Select/展示 */
export function flattenCategoryTree(
  tree: AdminCategoryOption[] | undefined | null,
  depth = 0,
  out: AdminCategoryFlat[] = [],
): AdminCategoryFlat[] {
  for (const node of tree ?? []) {
    out.push({ id: node.id, name: node.name, depth, parentId: node.parentId ?? null });
    if (node.children && node.children.length > 0) {
      flattenCategoryTree(node.children, depth + 1, out);
    }
  }
  return out;
}

/** 收集某个分类节点及其全部后代 id(用于编辑时排除自身/子级) */
export function collectNodeAndDescendants(
  tree: AdminCategoryOption[] | undefined | null,
  nodeId: string,
  out: string[] = [],
): string[] {
  for (const node of tree ?? []) {
    if (node.id === nodeId) {
      out.push(node.id);
      collectNodeAndDescendants(node.children, nodeId, out);
      return out;
    }
    if (node.children && node.children.length > 0) {
      collectNodeAndDescendants(node.children, nodeId, out);
    }
  }
  return out;
}

/** 统计分类下的直接商品数(兼容 productCount / _count.products 两种返回) */
export function categoryProductCount(category: {
  productCount?: number;
  _count?: { products?: number };
}): number {
  return category.productCount ?? category._count?.products ?? 0;
}

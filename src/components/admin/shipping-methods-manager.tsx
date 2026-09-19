"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ShippingMethodDialog } from "@/components/admin/shipping-method-dialog";
import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney, cn } from "@/lib/utils";

export interface ShippingOption {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  fee: number;
  freeOver: number;
  isCashOnDelivery: boolean;
  etaZh: string | null;
  etaEn: string | null;
  sortOrder: number;
  isActive: boolean;
  /** 已被多少订单引用（决定删除时是物理删还是停用） */
  orderCount?: number;
}

interface Props {
  initial: ShippingOption[];
  /** 门店基础币种（服务端 `env.CURRENCY` 透传）—— 透传给创建对话框渲染预设金额 */
  baseCurrency: string;
}

/** 结账页顾客看到的说明（与 checkout-flow 口径一致：description ?? etaZh） */
function customerDesc(m: ShippingOption): string | null {
  return m.description ?? m.etaZh ?? null;
}

/**
 * 物流方式管理：
 *  - 只读列表 + 对话框创建/编辑（shipping-method-dialog）
 *  - 启用开关行内即时生效（乐观更新，失败回滚）
 *  - 删除有订单引用时自动降级为停用（服务端行为，前端提示对应文案）
 */
export function ShippingMethodsManager({ initial, baseCurrency }: Props) {
  const [list, setList] = React.useState(initial);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ShippingOption | null>(null);
  const [deleting, setDeleting] = React.useState<ShippingOption | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const existingCodes = React.useMemo(() => list.map((m) => m.code), [list]);
  const nextSortOrder = React.useMemo(
    () => (list.length ? Math.max(...list.map((m) => m.sortOrder)) + 1 : 0),
    [list],
  );

  const refresh = React.useCallback(async () => {
    try {
      const body = await apiFetchRaw<{ data: { methods: ShippingOption[] } }>(
        "/api/admin/shipping-methods",
      );
      setList(body.data.methods);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刷新列表失败");
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (m: ShippingOption) => {
    setEditing(m);
    setDialogOpen(true);
  };

  /** 启用/停用：乐观更新，失败回滚 */
  const toggleActive = async (m: ShippingOption) => {
    const next = !m.isActive;
    setTogglingId(m.id);
    setList((prev) => prev.map((x) => (x.id === m.id ? { ...x, isActive: next } : x)));
    try {
      await apiFetch(`/api/admin/shipping-methods/${m.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: next }),
      });
      toast.success(next ? `「${m.name}」已启用` : `「${m.name}」已停用，前台结账页不再显示`);
    } catch (err) {
      setList((prev) => prev.map((x) => (x.id === m.id ? { ...x, isActive: m.isActive } : x)));
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const body = await apiFetchRaw<{
        data: { method?: ShippingOption; soft?: boolean; ok?: boolean };
      }>(`/api/admin/shipping-methods/${deleting.id}`, { method: "DELETE" });
      if (body.data.soft) {
        toast.success(`「${deleting.name}」已被订单使用，已改为停用（历史订单保留）`);
      } else {
        toast.success(`「${deleting.name}」已删除`);
      }
      setDeleting(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  const deleteHint = deleting
    ? deleting.orderCount && deleting.orderCount > 0
      ? `「${deleting.name}」已被 ${deleting.orderCount} 个订单引用。删除后该方式将自动转为停用（历史订单数据保留）。`
      : `确定删除「${deleting.name}」？该方式尚未被任何订单使用，将直接删除。`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          前台结账页按「排序」从小到大展示所有已启用方式；停用的方式保留在此，历史订单不受影响。
        </p>
        <Button onClick={openCreate} className="flex-shrink-0">
          <Plus className="h-4 w-4" />
          新建物流方式
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-6 w-6" />}
          title="还没有物流方式"
          description="创建第一个物流方式后，顾客结账时即可选择配送方案。可从快速模板一键开始。"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              创建第一个物流方式
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-center">排序</TableHead>
                    <TableHead className="w-28">代号</TableHead>
                    <TableHead className="min-w-[150px]">名称</TableHead>
                    <TableHead className="hidden min-w-[180px] lg:table-cell">
                      顾客看到的说明
                    </TableHead>
                    <TableHead className="w-24 text-right">运费</TableHead>
                    <TableHead className="hidden w-28 text-right md:table-cell">免邮门槛</TableHead>
                    <TableHead className="hidden w-20 text-center md:table-cell">
                      订单引用
                    </TableHead>
                    <TableHead className="w-20 text-center">启用</TableHead>
                    <TableHead className="min-w-[7rem] whitespace-nowrap text-right">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((m) => (
                    <TableRow key={m.id} className={cn(!m.isActive && "opacity-50")}>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {m.sortOrder}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{m.code}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{m.name}</span>
                        {m.nameEn ? (
                          <span className="block text-xs text-muted-foreground">{m.nameEn}</span>
                        ) : null}
                        {m.isCashOnDelivery ? (
                          <Badge variant="outline" className="mt-1 border-warning/40 text-warning">
                            货到付款
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden max-w-[220px] lg:table-cell">
                        <span className="block truncate text-sm" title={customerDesc(m) ?? ""}>
                          {customerDesc(m) ?? (
                            <span className="text-muted-foreground">（未填写）</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.isCashOnDelivery ? (
                          <span className="text-xs text-muted-foreground">到付</span>
                        ) : m.fee === 0 ? (
                          <span className="text-success">免邮</span>
                        ) : (
                          formatMoney(m.fee, baseCurrency)
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {m.freeOver > 0 ? `满 ${formatMoney(m.freeOver, baseCurrency)}` : "—"}
                      </TableCell>
                      <TableCell className="hidden text-center tabular-nums text-muted-foreground md:table-cell">
                        {m.orderCount ?? 0}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={m.isActive}
                          disabled={togglingId === m.id}
                          onCheckedChange={() => toggleActive(m)}
                          aria-label={`${m.isActive ? "停用" : "启用"} ${m.name}`}
                        />
                      </TableCell>
                      <TableCell className="min-w-[7rem] whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2"
                            onClick={() => openEdit(m)}
                            title="编辑"
                            aria-label={`编辑 ${m.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setDeleting(m)}
                            aria-label={`删除 ${m.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <ShippingMethodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        method={editing}
        existingCodes={existingCodes}
        nextSortOrder={nextSortOrder}
        baseCurrency={baseCurrency}
        onSaved={() => void refresh()}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="删除物流方式"
        description={deleteHint}
        confirmText="删除"
        destructive
        loading={deleteLoading}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

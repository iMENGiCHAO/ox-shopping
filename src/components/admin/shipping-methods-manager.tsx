"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { DataTableActions } from "@/components/admin/data-table-actions";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetch-client";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface Props {
  initial: ShippingOption[];
}

export function ShippingMethodsManager({ initial }: Props) {
  const [list, setList] = React.useState(initial);
  const [editing, setEditing] = React.useState<Record<string, Partial<ShippingOption>>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [creating, setCreating] = React.useState(false);
  const [newMethod, setNewMethod] = React.useState<Partial<ShippingOption>>({
    code: "",
    name: "",
    fee: 0,
    freeOver: 0,
    isCashOnDelivery: false,
    sortOrder: 0,
  });

  const save = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    setSaving((s) => ({ ...s, [id]: true }));
    try {
      const res = await apiFetch<{ method: ShippingOption }>(
        `/api/admin/shipping-methods/${id}`,
        { method: "PUT", body: JSON.stringify(patch) },
      );
      setList((prev) => prev.map((m) => (m.id === id ? { ...m, ...res.method } : m)));
      setEditing((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving((s) => ({ ...s, [id]: false }));
    }
  };

  const remove = async (id: string) => {
    if (!confirm("确定要禁用/删除该物流方式？")) return;
    try {
      await apiFetch(`/api/admin/shipping-methods/${id}`, { method: "DELETE" });
      // 重新拉
      const res = await apiFetch<{ methods: ShippingOption[] }>("/api/admin/shipping-methods");
      setList(res.methods);
      toast.success("已处理");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const create = async () => {
    if (!newMethod.code || !newMethod.name) {
      toast.error("请填写代号和名称");
      return;
    }
    setCreating(true);
    try {
      await apiFetch("/api/admin/shipping-methods", {
        method: "POST",
        body: JSON.stringify(newMethod),
      });
      const res = await apiFetch<{ methods: ShippingOption[] }>("/api/admin/shipping-methods");
      setList(res.methods);
      setNewMethod({
        code: "",
        name: "",
        fee: 0,
        freeOver: 0,
        isCashOnDelivery: false,
        sortOrder: 0,
      });
      toast.success("已新建");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新建失败");
    } finally {
      setCreating(false);
    }
  };

  const updateField = (id: string, key: keyof ShippingOption, value: unknown) => {
    setList((prev) => prev.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
    setEditing((e) => ({ ...e, [id]: { ...e[id], [key]: value } }));
  };

  return (
    <div className="space-y-6">
      {/* 列表 */}
      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 w-24 bg-card/95 backdrop-blur-sm">
                  代号
                </TableHead>
                <TableHead className="min-w-[140px]">名称 (zh)</TableHead>
                <TableHead className="hidden min-w-[140px] md:table-cell">名称 (en)</TableHead>
                <TableHead className="w-24 text-right">运费</TableHead>
                <TableHead className="hidden w-24 text-right md:table-cell">免邮门槛</TableHead>
                <TableHead className="hidden w-24 text-center lg:table-cell">货到付款</TableHead>
                <TableHead className="w-16 text-center">排序</TableHead>
                <TableHead className="w-16 text-center">启用</TableHead>
                <TableHead className="sticky right-0 z-20 w-20 bg-card/95 text-right backdrop-blur-sm">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((m) => (
                <TableRow key={m.id} className={cn(!m.isActive && "opacity-50")}>
                  <TableCell className="sticky left-0 z-10 bg-card/95 font-mono text-xs backdrop-blur-sm">
                    {m.code}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={m.name}
                      onChange={(e) => updateField(m.id, "name", e.target.value)}
                      className="h-8 w-full min-w-[120px]"
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Input
                      value={m.nameEn ?? ""}
                      onChange={(e) => updateField(m.id, "nameEn", e.target.value || null)}
                      className="h-8 w-full min-w-[120px]"
                      placeholder="Standard"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.fee}
                      onChange={(e) => updateField(m.id, "fee", Number(e.target.value))}
                      className="h-8 w-full text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.freeOver}
                      onChange={(e) => updateField(m.id, "freeOver", Number(e.target.value))}
                      className="h-8 w-full text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="hidden text-center lg:table-cell">
                    <Switch
                      checked={m.isCashOnDelivery}
                      onCheckedChange={(v) => updateField(m.id, "isCashOnDelivery", v)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min="0"
                      value={m.sortOrder}
                      onChange={(e) => updateField(m.id, "sortOrder", Number(e.target.value))}
                      className="h-8 w-full text-center tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={m.isActive}
                      onCheckedChange={(v) => updateField(m.id, "isActive", v)}
                    />
                  </TableCell>
                  <TableCell className="sticky right-0 z-10 bg-card/95 backdrop-blur-sm">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => save(m.id)}
                        disabled={!editing[m.id] || saving[m.id]}
                        title="保存"
                        aria-label="保存"
                      >
                        {saving[m.id] ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                      </Button>
                      <DataTableActions
                        actions={[
                          {
                            label: "删除（已被订单使用则改为禁用）",
                            icon: Trash2,
                            onClick: () => remove(m.id),
                            destructive: true,
                          },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新建 */}
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
        <h3 className="text-sm font-medium">新建物流方式</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Input
            placeholder="代号（英文/数字/短横线）"
            value={newMethod.code ?? ""}
            onChange={(e) => setNewMethod((p) => ({ ...p, code: e.target.value }))}
          />
          <Input
            placeholder="中文名"
            value={newMethod.name ?? ""}
            onChange={(e) => setNewMethod((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            placeholder="English name"
            value={newMethod.nameEn ?? ""}
            onChange={(e) => setNewMethod((p) => ({ ...p, nameEn: e.target.value }))}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="运费"
            value={newMethod.fee ?? 0}
            onChange={(e) => setNewMethod((p) => ({ ...p, fee: Number(e.target.value) }))}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="免邮门槛（0=不免）"
            value={newMethod.freeOver ?? 0}
            onChange={(e) => setNewMethod((p) => ({ ...p, freeOver: Number(e.target.value) }))}
          />
          <Input
            type="number"
            placeholder="排序"
            value={newMethod.sortOrder ?? 0}
            onChange={(e) => setNewMethod((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
          />
          <Input
            placeholder="ETA 中文（如 5-7 个工作日）"
            value={newMethod.etaZh ?? ""}
            onChange={(e) => setNewMethod((p) => ({ ...p, etaZh: e.target.value }))}
          />
          <Input
            placeholder="ETA English"
            value={newMethod.etaEn ?? ""}
            onChange={(e) => setNewMethod((p) => ({ ...p, etaEn: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!!newMethod.isCashOnDelivery}
              onCheckedChange={(v) => setNewMethod((p) => ({ ...p, isCashOnDelivery: v }))}
            />
            货到付款
          </label>
          <Button onClick={create} disabled={creating} size="sm">
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            新建
          </Button>
        </div>
      </div>
    </div>
  );
}

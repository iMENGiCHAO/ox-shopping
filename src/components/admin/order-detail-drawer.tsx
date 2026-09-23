"use client";

import * as React from "react";
import { Truck, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { AdminDrawer, AdminDrawerHeader } from "@/components/admin/admin-drawer";
import { ShipDialog } from "@/components/admin/ship-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
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
import type { AdminOrder, AdminOrderStatus } from "@/components/admin/types";

export interface OrderDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** order data (from list row, includes full product and amount info) */
  order: AdminOrder | null;
  /** called after status change / ship success (parent refreshes) */
  onChanged?: () => void;
}

/** Order detail drawer: full order info + status advance + shipping */
export function OrderDetailDrawer({
  open,
  onOpenChange,
  order,
  onChanged,
}: OrderDetailDrawerProps) {
  const [current, setCurrent] = React.useState<AdminOrder | null>(order);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [shipOpen, setShipOpen] = React.useState(false);
  // "ship" = 执行发货（状态推进为已发货）；"edit" = 仅补填/修改物流信息，不改变状态
  const [shipMode, setShipMode] = React.useState<"ship" | "edit">("ship");

  React.useEffect(() => {
    if (open) setCurrent(order);
  }, [open, order]);

  const changeStatus = async (to: AdminOrderStatus) => {
    if (!current) return;
    setStatusLoading(true);
    try {
      await apiFetch(`/api/admin/orders/${current.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: to }),
      });
      toast.success(`订单状态已更新为"${ORDER_STATUS_LABELS[to]}"`);
      setCurrent({ ...current, status: to });
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新订单状态失败");
    } finally {
      setStatusLoading(false);
    }
  };

  /* ---------------- 订单认领（数据孤岛修复）---------------- */
  const [assignLoading, setAssignLoading] = React.useState(false);

  const toggleAssign = async () => {
    if (!current) return;
    setAssignLoading(true);
    try {
      const res = await apiFetch<{
        order: { assignee?: { id: string; name: string; email: string } | null };
      }>(`/api/admin/orders/${current.id}/assign`, {
        method: current.assignee ? "DELETE" : "POST",
      });
      // 认领响应 include assignee；取消认领则直接置空。本地同步 current
      // （API 返回的是 Prisma 原始行而非序列化 AdminOrder，不能整体替换）。
      setCurrent({
        ...current,
        assignee: current.assignee ? null : (res.order?.assignee ?? null),
      });
      toast.success(current.assignee ? "已取消认领" : "认领成功，请跟进此订单");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "认领操作失败");
    } finally {
      setAssignLoading(false);
    }
  };

  const address = current?.addressSnapshot;
  const currency = current?.currency || "USD";

  /* ---------------- 收货地址编辑（P1-8）----------------
     背景：地址此前只读，顾客写错门牌号只能「取消重下」——已支付单要重新走
     支付/退款，还可能丢券与库存占用。这里允许运营直接改订单快照。 */
  const [addrEditing, setAddrEditing] = React.useState(false);
  const [addrDraft, setAddrDraft] = React.useState<Record<string, string>>({});
  const [addrSaving, setAddrSaving] = React.useState(false);

  /* ---------------- 内部备注（P1-8）---------------- */
  const [noteDraft, setNoteDraft] = React.useState("");
  const [noteSaving, setNoteSaving] = React.useState(false);

  // 打开/切换订单时重置编辑态与备注草稿（避免把 A 单的备注写到 B 单）。
  // ⚠️ 必须放在上面这些 setState 声明之后 —— 否则 ESLint react-hooks/immutability
  // 会判定「在声明前访问 setter」（effect 的闭包捕获顺序问题）。
  React.useEffect(() => {
    if (!open) return;
    setAddrEditing(false);
    setAddrDraft({});
    setNoteDraft(order?.adminNote ?? "");
  }, [open, order]);

  const startAddrEdit = () => {
    const a = current?.addressSnapshot;
    setAddrDraft({
      recipientName: a?.recipientName ?? "",
      phone: a?.phone ?? "",
      province: a?.province ?? "",
      city: a?.city ?? "",
      district: a?.district ?? "",
      detail: a?.detail ?? "",
    });
    setAddrEditing(true);
  };

  const saveAddress = async () => {
    if (!current) return;
    const recipientName = (addrDraft.recipientName ?? "").trim();
    const detail = (addrDraft.detail ?? "").trim();
    if (!recipientName || !detail) {
      toast.error("收件人与详细地址为必填项");
      return;
    }
    setAddrSaving(true);
    try {
      const res = await apiFetch<{ order: AdminOrder }>(`/api/admin/orders/${current.id}/address`, {
        method: "PUT",
        body: JSON.stringify({
          recipientName,
          detail,
          phone: addrDraft.phone?.trim() || null,
          province: addrDraft.province?.trim() || null,
          city: addrDraft.city?.trim() || null,
          district: addrDraft.district?.trim() || null,
        }),
      });
      if (res?.order) setCurrent(res.order);
      setAddrEditing(false);
      toast.success("收货地址已更新（已记录审计日志）");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "地址更新失败");
    } finally {
      setAddrSaving(false);
    }
  };

  const saveAdminNote = async () => {
    if (!current) return;
    setNoteSaving(true);
    try {
      const res = await apiFetch<{ order: AdminOrder }>(`/api/admin/orders/${current.id}/note`, {
        method: "PUT",
        body: JSON.stringify({ adminNote: noteDraft }),
      });
      if (res?.order) setCurrent(res.order);
      toast.success("内部备注已保存");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "备注保存失败");
    } finally {
      setNoteSaving(false);
    }
  };

  // 管理员不能直接标记为已送达，DELIVERED 只能由购物者确认收货
  // 所以 SHIPPED 状态的可推进状态只显示 REFUNDED
  const rawNextStatuses = current ? (ORDER_STATUS_FLOW[current.status] ?? []) : [];
  const nextStatuses =
    current?.status === "SHIPPED"
      ? rawNextStatuses.filter((s) => s !== "DELIVERED")
      : rawNextStatuses;
  // Paid/processing can ship; shipped can edit shipping info
  const canShip = Boolean(
    current && (current.status === "PAID" || current.status === "PROCESSING"),
  );
  // 已支付/处理中/已发货/已送达均可补填或修改物流信息（与后端 PUT /tracking 的允许状态一致）
  const canEditTracking = Boolean(
    current &&
    (current.status === "PAID" ||
      current.status === "PROCESSING" ||
      current.status === "SHIPPED" ||
      current.status === "DELIVERED"),
  );

  return (
    <AdminDrawer open={open} onOpenChange={(v) => !statusLoading && onOpenChange(v)}>
      <AdminDrawerHeader
        title={current ? `订单 # ${current.orderNumber}` : "订单详情"}
        description={
          current ? `下单时间：${new Date(current.createdAt).toLocaleString("zh-CN")}` : undefined
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {!current ? (
          <p className="py-10 text-center text-sm text-muted-foreground">暂无订单数据</p>
        ) : (
          <div className="space-y-6">
            {/* Order info */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">订单信息</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="text-muted-foreground">订单状态</div>
                <div>
                  <StatusBadge status={current.status} labelMap={{ ...ORDER_STATUS_LABELS }} />
                </div>
                <div className="text-muted-foreground">认领人</div>
                <div className="flex items-center gap-2">
                  {current.assignee ? (
                    <>
                      <span title={current.assignee.email}>{current.assignee.name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        disabled={assignLoading}
                        onClick={() => void toggleAssign()}
                      >
                        取消认领
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      disabled={assignLoading}
                      onClick={() => void toggleAssign()}
                    >
                      <UserCheck className="mr-1 h-3 w-3" />
                      认领跟进
                    </Button>
                  )}
                </div>
                <div className="text-muted-foreground">支付方式</div>
                <div>
                  {current.paymentProvider === "stripe"
                    ? "Stripe"
                    : current.paymentProvider === "mock"
                      ? "模拟支付"
                      : current.paymentProvider === "cod"
                        ? "货到付款"
                        : "-"}
                </div>
                {current.isCashOnDelivery ? (
                  <>
                    <div className="text-muted-foreground">到付参考金额</div>
                    <div>
                      送达时收现金：{current.currency}{" "}
                      {(Number(current.total) + Number(current.codFee ?? 0)).toFixed(2)}
                      {Number(current.codFee ?? 0) > 0
                        ? `（含到付费 ${Number(current.codFee).toFixed(2)}）`
                        : ""}
                    </div>
                  </>
                ) : null}
                <div className="text-muted-foreground">买家</div>
                <div>
                  {current.user?.name ?? "-"}({current.user?.email ?? "-"})
                </div>
                <div className="text-muted-foreground">订单备注</div>
                <div className="break-all">{current.note || "-"}</div>
              </div>
            </section>

            {/* Shipping address */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">收货地址</h3>
                {!addrEditing ? (
                  <Button size="sm" variant="outline" onClick={startAddrEdit}>
                    编辑地址
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={addrSaving}
                      onClick={() => setAddrEditing(false)}
                    >
                      取消
                    </Button>
                    <Button size="sm" disabled={addrSaving} onClick={() => void saveAddress()}>
                      {addrSaving ? "保存中…" : "保存地址"}
                    </Button>
                  </div>
                )}
              </div>
              {addrEditing ? (
                <div className="space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      value={addrDraft.recipientName ?? ""}
                      onChange={(e) =>
                        setAddrDraft((d) => ({ ...d, recipientName: e.target.value }))
                      }
                      placeholder="收件人 *"
                    />
                    <Input
                      value={addrDraft.phone ?? ""}
                      onChange={(e) => setAddrDraft((d) => ({ ...d, phone: e.target.value }))}
                      placeholder="联系电话"
                    />
                    <Input
                      value={addrDraft.province ?? ""}
                      onChange={(e) => setAddrDraft((d) => ({ ...d, province: e.target.value }))}
                      placeholder="省/州"
                    />
                    <Input
                      value={addrDraft.city ?? ""}
                      onChange={(e) => setAddrDraft((d) => ({ ...d, city: e.target.value }))}
                      placeholder="城市"
                    />
                    <Input
                      value={addrDraft.district ?? ""}
                      onChange={(e) => setAddrDraft((d) => ({ ...d, district: e.target.value }))}
                      placeholder="区/县"
                    />
                    <Input
                      value={addrDraft.postalCode ?? ""}
                      onChange={(e) => setAddrDraft((d) => ({ ...d, postalCode: e.target.value }))}
                      placeholder="邮编"
                    />
                  </div>
                  <Textarea
                    value={addrDraft.detail ?? ""}
                    onChange={(e) => setAddrDraft((d) => ({ ...d, detail: e.target.value }))}
                    placeholder="详细地址（街道、门牌号）*"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    修改会记录审计日志（含改动前后快照）；发货后改址请同步通知承运商。
                  </p>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-4 text-sm">
                  {address ? (
                    <p>
                      {address.recipientName}　{address.phone}
                      <br />
                      {address.province}
                      {address.city}
                      {address.district} {address.detail}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">暂无收货地址</p>
                  )}
                </div>
              )}
            </section>

            {/* 内部备注（仅后台可见，不随邮件发给顾客） */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">内部备注</h3>
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="仅后台可见，例如：已电话确认改址 / 客户要求延迟发货"
                rows={2}
                className="text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  顾客备注（下方）保持原样，不会被这里覆盖。
                </p>
                <Button
                  size="sm"
                  disabled={noteSaving || noteDraft === (current?.adminNote ?? "")}
                  onClick={() => void saveAdminNote()}
                >
                  {noteSaving ? "保存中…" : "保存备注"}
                </Button>
              </div>
            </section>

            {/* Items */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">商品</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead className="w-20">单价</TableHead>
                    <TableHead className="w-16">数量</TableHead>
                    <TableHead className="w-24 text-right">小计</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(current.items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[220px] truncate" title={item.productName}>
                        {item.productName}
                        <span className="block text-xs text-muted-foreground">{item.sku}</span>
                      </TableCell>
                      <TableCell>{formatMoney(item.price, currency)}</TableCell>
                      <TableCell>×{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(item.subtotal, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            {/* Amount breakdown */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">金额明细</h3>
              <div className="space-y-1 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">商品小计</span>
                  <span>{formatMoney(current.subtotal, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">运费</span>
                  <span>{formatMoney(current.shippingFee, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">税费</span>
                  <span>{formatMoney(current.tax, currency)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>实付金额</span>
                  <span>{formatMoney(current.total, currency)}</span>
                </div>
              </div>
            </section>

            {/* Shipping info */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">物流信息</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="text-muted-foreground">物流商</div>
                <div>{current.trackingCompany || "-"}</div>
                <div className="text-muted-foreground">物流单号</div>
                <div>{current.trackingNumber || "-"}</div>
                <div className="text-muted-foreground">发货时间</div>
                <div>
                  {current.shippedAt ? new Date(current.shippedAt).toLocaleString("zh-CN") : "-"}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Bottom action area */}
      {current ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">推进状态：</span>
            <Select
              value={current.status}
              onValueChange={(v) => void changeStatus(v as AdminOrderStatus)}
            >
              <SelectTrigger className="w-36" disabled={statusLoading}>
                {/* value 是"当前状态"，但选项只列"下一可推进状态"，
                    Radix 匹配不到对应 SelectItem 会显示空白 → 用 placeholder 兜底当前状态文案 */}
                <SelectValue placeholder={ORDER_STATUS_LABELS[current.status] ?? current.status} />
              </SelectTrigger>
              <SelectContent>
                {nextStatuses.length > 0 ? (
                  nextStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ORDER_STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={current.status} disabled>
                    已无下一可推进状态
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {canShip ? (
            <Button
              size="sm"
              onClick={() => {
                setShipMode("ship");
                setShipOpen(true);
              }}
            >
              <Truck className="h-4 w-4" />
              发货
            </Button>
          ) : null}
          {canEditTracking ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShipMode("edit");
                setShipOpen(true);
              }}
            >
              <Truck className="h-4 w-4" />
              {current?.trackingNumber ? "修改物流" : "补填物流"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <ShipDialog
        open={shipOpen}
        onOpenChange={setShipOpen}
        orderId={current?.id ?? null}
        mode={shipMode}
        initial={{
          trackingCompany: current?.trackingCompany,
          trackingNumber: current?.trackingNumber,
        }}
        onSaved={(tracking) => {
          if (current) {
            setCurrent({
              ...current,
              status: shipMode === "ship" ? "SHIPPED" : current.status,
              ...(tracking
                ? {
                    trackingCompany: tracking.trackingCompany,
                    trackingNumber: tracking.trackingNumber,
                  }
                : {}),
            });
          }
          onChanged?.();
        }}
      />
    </AdminDrawer>
  );
}

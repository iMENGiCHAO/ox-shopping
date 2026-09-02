"use client";

import * as React from "react";
import { Truck } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { ORDER_STATUS_FLOW, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { AdminDrawer, AdminDrawerHeader } from "@/components/admin/admin-drawer";
import { ShipDialog } from "@/components/admin/ship-dialog";
import { Button } from "@/components/ui/button";
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

  const address = current?.addressSnapshot;
  const nextStatuses = current ? (ORDER_STATUS_FLOW[current.status] ?? []) : [];
  // Paid/processing can ship; shipped can edit shipping info
  const canShip = Boolean(
    current && (current.status === "PAID" || current.status === "PROCESSING"),
  );
  const canEditTracking = Boolean(current && current.status === "SHIPPED");

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
                <div className="text-muted-foreground">支付方式</div>
                <div>
                  {current.paymentProvider === "stripe"
                    ? "Stripe"
                    : current.paymentProvider === "mock"
                      ? "模拟支付"
                      : "-"}
                </div>
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
              <h3 className="text-sm font-semibold">收货地址</h3>
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
                      <TableCell>{formatMoney(item.price)}</TableCell>
                      <TableCell>×{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatMoney(item.subtotal)}</TableCell>
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
                  <span>{formatMoney(current.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">运费</span>
                  <span>{formatMoney(current.shippingFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">税费</span>
                  <span>{formatMoney(current.tax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">优惠券</span>
                  <span>-{formatMoney(current.discount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>实付金额</span>
                  <span>{formatMoney(current.total)}</span>
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
                <SelectValue />
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
            <Button size="sm" onClick={() => setShipOpen(true)}>
              <Truck className="h-4 w-4" />
              发货
            </Button>
          ) : null}
          {canEditTracking ? (
            <Button size="sm" variant="outline" onClick={() => setShipOpen(true)}>
              <Truck className="h-4 w-4" />
              修改物流
            </Button>
          ) : null}
        </div>
      ) : null}

      <ShipDialog
        open={shipOpen}
        onOpenChange={setShipOpen}
        orderId={current?.id ?? null}
        mode={canEditTracking ? "edit" : "ship"}
        initial={{
          trackingCompany: current?.trackingCompany,
          trackingNumber: current?.trackingNumber,
        }}
        onSaved={(tracking) => {
          if (current) {
            setCurrent({
              ...current,
              status: canEditTracking ? current.status : "SHIPPED",
              ...(tracking ? { trackingCompany: tracking.trackingCompany, trackingNumber: tracking.trackingNumber } : {}),
            });
          }
          onChanged?.();
        }}
      />
    </AdminDrawer>
  );
}

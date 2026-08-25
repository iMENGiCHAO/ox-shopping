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
      toast.success(`Order status updated to"${ORDER_STATUS_LABELS[to]}"`);
      setCurrent({ ...current, status: to });
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order status");
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
        title={current ? `Order # ${current.orderNumber}` : "Order details"}
        description={
          current ? `Placed: ${new Date(current.createdAt).toLocaleString("zh-CN")}` : undefined
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {!current ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No order data</p>
        ) : (
          <div className="space-y-6">
            {/* Order info */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Order info</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="text-muted-foreground">Order status</div>
                <div>
                  <StatusBadge status={current.status} labelMap={{ ...ORDER_STATUS_LABELS }} />
                </div>
                <div className="text-muted-foreground">Payment</div>
                <div>
                  {current.paymentProvider === "stripe"
                    ? "Stripe"
                    : current.paymentProvider === "mock"
                      ? "Mock payment"
                      : "-"}
                </div>
                <div className="text-muted-foreground">Buyer</div>
                <div>
                  {current.user?.name ?? "-"}({current.user?.email ?? "-"})
                </div>
                <div className="text-muted-foreground">Order note</div>
                <div className="break-all">{current.note || "-"}</div>
              </div>
            </section>

            {/* Shipping address */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Shipping address</h3>
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
                  <p className="text-muted-foreground">No shipping address on file</p>
                )}
              </div>
            </section>

            {/* Items */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Items</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-20">Price</TableHead>
                    <TableHead className="w-16">Qty</TableHead>
                    <TableHead className="w-24 text-right">Subtotal</TableHead>
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
              <h3 className="text-sm font-semibold">Amount breakdown</h3>
              <div className="space-y-1 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(current.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{formatMoney(current.shippingFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatMoney(current.tax)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Coupon</span>
                  <span>-{formatMoney(current.discount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total paid</span>
                  <span>{formatMoney(current.total)}</span>
                </div>
              </div>
            </section>

            {/* Shipping info */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Shipping info</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="text-muted-foreground">Carrier</div>
                <div>{current.trackingCompany || "-"}</div>
                <div className="text-muted-foreground">Tracking #</div>
                <div>{current.trackingNumber || "-"}</div>
                <div className="text-muted-foreground">Shipped</div>
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
            <span className="text-sm text-muted-foreground">Advance status: </span>
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
                    No further status available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {canShip ? (
            <Button size="sm" onClick={() => setShipOpen(true)}>
              <Truck className="h-4 w-4" />
              Ship
            </Button>
          ) : null}
          {canEditTracking ? (
            <Button size="sm" variant="outline" onClick={() => setShipOpen(true)}>
              <Truck className="h-4 w-4" />
              Edit shipping
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

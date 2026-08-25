import Link from "next/link";
import { ArrowUpRight, Package, ShoppingCart, TrendingUp, Users } from "lucide-react";

import { getAdminStats } from "@/server/services/stats.service";
import { formatMoney } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SalesTrendChart } from "@/components/admin/sales-trend-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LucideIcon } from "lucide-react";
import { getT } from "@/lib/admin-i18n-server";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card className="shadow-card transition-shadow hover:shadow-soft">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 truncate text-[28px] font-bold leading-tight tracking-tight">
              {value}
            </p>
            {sub ? (
              <p className="mt-1 truncate text-[12px] text-muted-foreground">{sub}</p>
            ) : null}
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.04] text-foreground/60">
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard (server-rendered): stat cards + sales trend + top products + recent orders */
export default async function AdminDashboardPage() {
  const t = getT();
  const stats = await getAdminStats();

  const trend = stats.trend.map((p) => ({ date: p.date, orders: p.orders, revenue: p.revenue }));

  return (
    <div className="space-y-8">
      <AdminPageHeader title={t("Dashboard")} description={t("Store performance overview")} />

      {/* Top stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label={t("Total Revenue")}
          value={formatMoney(stats.todayRevenue)}
          sub={`${stats.todayOrders} ${t("Orders")}`}
        />
        <StatCard
          icon={ShoppingCart}
          label={t("Total Revenue")}
          value={formatMoney(stats.revenue)}
          sub={`${stats.paidOrderCount} ${t("Orders")}`}
        />
        <StatCard
          icon={Package}
          label={t("Orders")}
          value={stats.orderCount}
          sub={`${stats.activeProductCount} / ${stats.productCount} ${t("Products")}`}
        />
        <StatCard
          icon={Users}
          label={t("Pending Shipments")}
          value={stats.pendingShipCount + stats.pendingRefundCount}
          sub={`${stats.pendingShipCount} ${t("Pending Shipments")} · ${stats.pendingRefundCount} ${t("Refunds")}`}
        />
      </div>

      {/* Sales trend + Top products */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="shadow-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-[15px] font-semibold tracking-tight">
              {t("Sales Trend")} &middot; 14 {t("days")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SalesTrendChart data={trend} />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-[15px] font-semibold tracking-tight">
              {t("Top Products")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.topProducts.map((p, index) => (
              <div key={p.id} className="flex items-center gap-3">
                <span
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold " +
                    (index < 3
                      ? "bg-accent/12 text-accent"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href="/admin/products"
                    className="block truncate text-[13px] font-medium hover:underline"
                    title={p.name}
                  >
                    {p.name}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    {p.soldCount} {t("sold")} · {p.stock} {t("Stock")}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] font-semibold">
                  {formatMoney(Number(p.price))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[15px] font-semibold tracking-tight">{t("Recent Orders")}</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/orders">
              {t("View all")}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Order #")}</TableHead>
                <TableHead>{t("Customer")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead>{t("Total")}</TableHead>
                <TableHead>{t("Date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href="/admin/orders"
                      className="font-medium text-foreground hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="truncate text-[13px] font-medium">{order.user.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {order.user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} labelMap={{ ...ORDER_STATUS_LABELS }} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatMoney(Number(order.total))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[13px] text-muted-foreground">
                    {order.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
          {stats.recentOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("No data yet")}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

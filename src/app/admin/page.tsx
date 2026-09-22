import Link from "next/link";
import { ArrowUpRight, BellRing, Package, ShoppingCart, TrendingUp, Users } from "lucide-react";

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
    <Card className="shadow-card transition-shadow hover:shadow-card-hover">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 truncate text-[26px] font-semibold leading-tight tracking-tight text-foreground">
              {value}
            </p>
            {sub ? (
              <p className="mt-1.5 truncate text-[12px] text-muted-foreground">{sub}</p>
            ) : null}
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground/70">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard (server-rendered): stat cards + sales trend + top products + recent orders */
export default async function AdminDashboardPage() {
  const t = await getT();
  const stats = await getAdminStats();

  const trend = stats.trend.map((p) => ({ date: p.date, orders: p.orders, revenue: p.revenue }));
  // 多币种汇总：按人民币等值降序展示各结算币种的原币种营收
  const currencyRows = Object.entries(stats.revenueByCurrency ?? {}).sort(
    (a, b) => b[1].cnyEquivalent - a[1].cnyEquivalent,
  );

  return (
    <div className="space-y-8">
      <AdminPageHeader title={t("Dashboard")} description={t("Store performance overview")} />

      {/* Top stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label={t("Today's Revenue")}
          value={formatMoney(stats.todayRevenue, "CNY")}
          sub={`${stats.todayOrders} ${t("Orders")} · 汇率 1USD=${stats.usdToCnyRate.toFixed(2)}CNY`}
        />
        <StatCard
          icon={ShoppingCart}
          label={t("All-time Revenue")}
          value={formatMoney(stats.revenue, "CNY")}
          sub={`${stats.paidOrderCount} ${t("Orders")} · 折合 $${stats.revenueUsd.toFixed(2)}`}
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
          value={stats.pendingShipCount}
          sub={`${stats.pendingShipCount} ${t("Pending Shipments")} · ${stats.pendingRefundCount} ${t("Refunds")}`}
        />
      </div>

      {/* 运营信号（数据孤岛修复落地）：lowStockCount / notifyMeCount 此前服务端
          算了却从未展示 —— 渲染成可点击入口，直达各自列表；低库存链接预置筛选，
          与仪表盘计数完全同口径（ACTIVE + stock ≤ 生效阈值）。 */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/products?stock=low&status=ACTIVE"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-[13px] shadow-card transition-shadow hover:shadow-card-hover"
        >
          <Package className="h-4 w-4 text-foreground/70" strokeWidth={1.75} />
          <span className="text-muted-foreground">{t("Low Stock")}</span>
          <span className="font-semibold">{stats.lowStockCount}</span>
          <span className="text-[11px] text-muted-foreground">≤ {stats.lowStockThreshold}</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
        <Link
          href="/admin/notify-me"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-[13px] shadow-card transition-shadow hover:shadow-card-hover"
        >
          <BellRing className="h-4 w-4 text-foreground/70" strokeWidth={1.75} />
          <span className="text-muted-foreground">{t("Notify Me")}</span>
          <span className="font-semibold">{stats.notifyMeCount}</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
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
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold " +
                    (index < 3
                      ? "bg-secondary text-foreground"
                      : "bg-secondary/60 text-muted-foreground")
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
                  {formatMoney(Number(p.price), "USD")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Sales by currency — 多币种结算的原币种营收汇总（人民币等值折算展示） */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-[15px] font-semibold tracking-tight">
            {t("Sales by Currency")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currencyRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("No data yet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Currency")}</TableHead>
                    <TableHead className="text-right">{t("Orders")}</TableHead>
                    <TableHead className="text-right">{t("Revenue (original currency)")}</TableHead>
                    <TableHead className="text-right">{t("CNY equivalent")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currencyRows.map(([code, r]) => (
                    <TableRow key={code}>
                      <TableCell>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[12px] font-semibold">
                          {code}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(r.total, code)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ¥{r.cnyEquivalent.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {t(
              "Revenue amounts use the exchange-rate snapshot captured at order time — paid orders never drift with live rates.",
            )}
          </p>
        </CardContent>
      </Card>

      {/* Recent orders */}
      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[15px] font-semibold tracking-tight">
            {t("Recent Orders")}
          </CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/orders">
              {t("View all")}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
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
                      {/* 游客订单没有 user 关联，回落到订单联系邮箱与「游客」标识 */}
                      <div className="truncate text-[13px] font-medium">
                        {order.user?.name ?? t("Guest")}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {order.user?.email ?? order.contactEmail ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} labelMap={{ ...ORDER_STATUS_LABELS }} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatMoney(Number(order.total), order.currency || "USD")}
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
            </Table>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("No data yet")}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

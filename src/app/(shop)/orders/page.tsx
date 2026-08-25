import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { OrderCard, type OrderCardData } from "@/components/shop/order-card";
import { cn } from "@/lib/utils";
import type { OrderStatus, Prisma } from "@prisma/client";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Orders",
  description: "View and manage all your orders",
};

const PAGE_SIZE = 10;
const STATUS_TABS = [
  "ALL",
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

interface OrdersPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/orders");
  const t = getT();

  const sp = searchParams;
  const statusKey = typeof sp.status === "string" ? sp.status : "";
  const validStatuses = Object.keys(ORDER_STATUS_LABELS);
  const status: OrderStatus | undefined =
    statusKey && statusKey !== "ALL" && validStatuses.includes(statusKey)
      ? (statusKey as OrderStatus)
      : undefined;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const where: Prisma.OrderWhereInput = { userId: user.id };
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (nextStatus: string, p: number) => {
    const qs = new URLSearchParams();
    if (nextStatus !== "ALL") qs.set("status", nextStatus);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/orders${s ? `?${s}` : ""}`;
  };

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-[28px] font-normal text-foreground">{t("My Orders")}</h1>

      {/* Status tabs */}
      <div className="mb-6 flex flex-wrap gap-px border border-border bg-secondary">
        {STATUS_TABS.map((key) => {
          const active = (status ?? "ALL") === key;
          return (
            <a
              key={key}
              href={buildHref(key, 1)}
              className={cn(
                "px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {key === "ALL" ? t("All") : t(ORDER_STATUS_LABELS[key as OrderStatus])}
            </a>
          );
        })}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-5 w-5" />}
          title={t("No matching orders")}
          description={
            status
              ? t("No orders in this status — try another status filter.")
              : t("No orders yet — go pick something you like!")
          }
          action={
            <a
              href="/products"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("Browse Products")}
            </a>
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const card: OrderCardData = {
              orderNumber: order.orderNumber,
              status: order.status,
              createdAt: order.createdAt,
              total: Number(order.total),
              currency: order.currency,
              items: order.items.map((item) => ({
                productName: item.productName,
                productImage: item.productImage,
                quantity: item.quantity,
                price: Number(item.price),
                productId: item.productId,
              })),
            };
            return <OrderCard key={order.id} order={card} />;
          })}
          <Pagination
            page={page}
            totalPages={totalPages}
            hrefBuilder={(p) => buildHref(status ?? "ALL", p)}
          />
        </div>
      )}
    </div>
  );
}

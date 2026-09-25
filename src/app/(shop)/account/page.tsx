import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, MapPin, Package, PackageOpen, Truck, type LucideIcon } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/shop-i18n-server";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminConsoleCard } from "@/components/shop/admin-console-card";
import { DistributionShareCard } from "@/components/shop/distribution/share-card";
import { OrderCard, type OrderCardData } from "@/components/shop/order-card";

export const dynamic = "force-dynamic";

/**
 * 账户总览页（大爷 2026-09-20 定制：顶栏 Account 点进来 = 账号总预览页）。
 *
 * 三条设计约束都来自大爷的原话：
 *   1. 「直接点进去就相当于账号的总预览页」→ 这里集中回答"我现在有什么"：
 *      进行中订单 / 累计订单 / 收货地址 / 未读消息 + 最近订单；
 *   2. 「样式做好看一点、符合整个网站的风格」→ 全部复用商城既有视觉：
 *      `Card`（白底细边框）+ `OrderCard`（订单页同款）+ `EmptyState` + 同一套图标与字号，
 *      不引入任何新的设计语言；
 *   3. 「不要里面什么都有、很杂乱」→ 只放**四张小统计卡 + 一张分享卡 + 最近两单**，
 *      不放设置项、不放导出/注销（那些都在 Profile 页面），一屏看完。
 *
 * 服务端直出（`prisma` 查询 + async 组件），点进来即有内容，不闪骨架屏；
 * 唯一的客户端组件是那张分享卡（要读剪贴板/调分销接口）。
 */
export default async function AccountIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");
  const t = await getT();

  const [totalOrders, activeOrders, addressCount, unreadCount, recentOrders] = await Promise.all([
    prisma.order.count({ where: { userId: user.id } }),
    prisma.order.count({
      where: { userId: user.id, status: { in: ["PAID", "PROCESSING", "SHIPPED"] } },
    }),
    prisma.address.count({ where: { userId: user.id } }),
    prisma.notification.count({ where: { userId: user.id, isUnread: true } }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 2,
      include: {
        items: { select: { productName: true, productImage: true, quantity: true, price: true } },
      },
    }),
  ]);

  const stats: {
    href: string;
    icon: LucideIcon;
    label: string;
    value: number;
    badge?: boolean;
  }[] = [
    { href: "/orders", icon: Package, label: t("Total orders"), value: totalOrders },
    { href: "/orders?status=SHIPPED", icon: Truck, label: t("In progress"), value: activeOrders },
    {
      href: "/account/addresses",
      icon: MapPin,
      label: t("Shipping Address"),
      value: addressCount,
    },
    {
      href: "/account/notifications",
      icon: Bell,
      label: t("Notifications"),
      value: unreadCount,
      badge: unreadCount > 0,
    },
  ];

  const orders: OrderCardData[] = recentOrders.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    total: Number(o.total),
    currency: o.currency,
    exchangeRate: Number(o.exchangeRate),
    items: o.items.map((i) => ({
      productName: i.productName,
      productImage: i.productImage,
      quantity: i.quantity,
      price: Number(i.price),
    })),
  }));

  return (
    // data-modern-cards：本页是"面板型"界面，用现代圆角 + 柔和阴影（只作用于本容器，
    // 商城前台其它页面仍是 上游参考站 的方角无阴影）
    <div className="space-y-6" data-modern-cards>
      {/* 一览：四张小卡（与商城同一套 Card/hairline 风格，不做仪表盘） */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group outline-none">
            <div className="panel flex h-full flex-col gap-3 border border-border bg-card p-4 shadow-card group-hover:border-foreground/30 group-focus-visible:border-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground">
                <s.icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-[24px] font-semibold tabular-nums leading-none">
                  {s.value}
                </span>
                {s.badge ? (
                  <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden />
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* 员工账号：进入管理后台（新标签页；顾客账号不渲染） */}
      <AdminConsoleCard role={user.role} />

      {/* 分享赚佣金小卡片（成功推广后才多出「进入分销中心」） */}
      <DistributionShareCard />

      {/* 最近订单：两单，复用订单页同款 OrderCard */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">{t("Recent orders")}</h2>
          <Link
            href="/orders"
            className="text-[13px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t("View all")}
          </Link>
        </div>
        {orders.length > 0 ? (
          orders.map((o) => <OrderCard key={o.orderNumber} order={o} />)
        ) : (
          <EmptyState
            icon={<PackageOpen className="h-5 w-5" />}
            title={t("No orders yet")}
            description={t("No orders yet — go pick something you like!")}
            action={
              <Link
                href="/collections/all"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("Browse Products")}
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}

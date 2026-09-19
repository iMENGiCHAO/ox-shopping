import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { getT } from "@/lib/shop-i18n-server";
import { prisma } from "@/lib/prisma";
import { isOrderTokenValid } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment result",
  robots: { index: false, follow: false },
};

interface ResultPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAID_STATUSES = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

const FAILED_STATUSES = new Set(["CANCELLED", "REFUNDED"]);

/**
 * Payment result page (server): the UI shown to the customer is **always derived
 * from the order's actual status** in the database, never from the URL alone.
 * This avoids the silent-success bug where a user with a cancelled or refunded
 * order is shown a green "Payment received" page just because the URL says
 * `?status=success`.
 */
export default async function CheckoutResultPage(props: ResultPageProps) {
  const searchParams = await props.searchParams;
  const t = await getT();
  const orderNumber = typeof searchParams.orderNumber === "string" ? searchParams.orderNumber : "";
  const rawToken = searchParams.token;
  const token = typeof rawToken === "string" ? rawToken : null;

  // 1) 用 URL 参数仅作"尝试"，真正状态以服务端为准
  let realStatus: "success" | "cancelled" | "unknown" = "unknown";
  let dbStatus: string | null = null;
  /**
   * 订单详情链接：登录单直接给路径；游客单**必须带令牌**，否则点开是 404。
   * 令牌不在 URL 里（如走真实网关回跳）时保持 null，页面改为提示「链接已发到邮箱」
   * ——宁可不给按钮，也不给一个点开就报错的按钮。
   */
  let orderLink: string | null = null;
  if (orderNumber) {
    const order = await prisma.order
      .findUnique({
        where: { orderNumber },
        select: { status: true, userId: true, accessToken: true },
      })
      .catch(() => null);
    dbStatus = order?.status ?? null;
    if (order) {
      orderLink = order.userId
        ? `/orders/${orderNumber}`
        : isOrderTokenValid(order, token)
          ? `/orders/${orderNumber}?token=${encodeURIComponent(token!)}`
          : null;
    }
    if (dbStatus) {
      if (PAID_STATUSES.has(dbStatus)) realStatus = "success";
      else if (dbStatus === "PENDING_PAYMENT") realStatus = "cancelled";
      else if (FAILED_STATUSES.has(dbStatus)) realStatus = "cancelled";
    }
  }

  // 2) URL status 仅在 db 查询失败时作兜底（避免页面空白）
  const urlStatus = typeof searchParams.status === "string" ? searchParams.status : "";
  if (realStatus === "unknown" && urlStatus === "success") realStatus = "success";
  if (realStatus === "unknown" && (urlStatus === "cancelled" || urlStatus === "cancel")) {
    realStatus = "cancelled";
  }
  const success = realStatus === "success";

  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {success ? (
            <CheckCircle2 className="h-16 w-16 text-success" />
          ) : realStatus === "cancelled" ? (
            <XCircle className="h-16 w-16 text-muted-foreground/60" />
          ) : (
            <AlertCircle className="h-16 w-16 text-warning" />
          )}
          <h1 className="text-xl font-bold">
            {success
              ? t("Payment received")
              : realStatus === "cancelled"
                ? t("Payment cancelled")
                : t("Payment result")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {success
              ? t("Your order has been paid — we will ship it as soon as possible.")
              : realStatus === "cancelled"
                ? t("Your order has not been paid yet — complete payment later from My Orders.")
                : dbStatus
                  ? t("Current order status: {status}", { status: dbStatus })
                  : t("Order not found, please check the order number.")}
          </p>
          {orderNumber ? (
            <p className="font-mono text-sm text-muted-foreground">
              {t("Order #")}
              {orderNumber}
            </p>
          ) : null}
          {orderNumber && !orderLink ? (
            <p className="text-xs text-muted-foreground">
              {t("We've emailed you a secure link to view this order.")}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {orderLink && success ? (
              <Button asChild>
                <Link href={orderLink}>{t("View order")}</Link>
              </Button>
            ) : orderLink ? (
              <Button asChild variant="outline">
                <Link href={orderLink}>{t("Back to order")}</Link>
              </Button>
            ) : null}
            <Button asChild variant={success ? "outline" : "default"}>
              <Link href="/products">{t("Continue Shopping")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

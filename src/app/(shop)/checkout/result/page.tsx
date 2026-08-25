import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment result",
  robots: { index: false, follow: false },
};

interface ResultPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

/** Payment result page (server): success / cancelled */
export default function CheckoutResultPage({ searchParams }: ResultPageProps) {
  const t = getT();
  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const orderNumber = typeof searchParams.orderNumber === "string" ? searchParams.orderNumber : "";
  const success = status === "success";

  return (
    <div className="container flex justify-center py-16">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {success ? (
            <CheckCircle2 className="h-16 w-16 text-success" />
          ) : (
            <XCircle className="h-16 w-16 text-muted-foreground/60" />
          )}
          <h1 className="text-xl font-bold">{success ? t("Payment received") : t("Payment cancelled")}</h1>
          <p className="text-sm text-muted-foreground">
            {success
              ? t("Your order has been paid — we will ship it as soon as possible.")
              : t("Your order has not been paid yet — complete payment later from My Orders.")}
          </p>
          {orderNumber ? (
            <p className="font-mono text-sm text-muted-foreground">{t("Order #")}{orderNumber}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {success ? (
              <Button asChild>
                <Link href={`/orders/${orderNumber}`}>{t("View order")}</Link>
              </Button>
            ) : orderNumber ? (
              <Button asChild variant="outline">
                <Link href={`/orders/${orderNumber}`}>{t("Back to order")}</Link>
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

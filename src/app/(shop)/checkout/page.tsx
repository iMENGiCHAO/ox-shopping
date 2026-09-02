import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/shop/checkout-flow";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Fill in shipping info and submit your order",
  robots: { index: false, follow: false },
};

interface CheckoutPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Checkout page (server wrapper: reads searchParams and passes to the client checkout flow) */
export default async function CheckoutPage(props: CheckoutPageProps) {
  const searchParams = await props.searchParams;
  const t = await getT();
  const buyNow = typeof searchParams.buyNow === "string" ? searchParams.buyNow : undefined;
  const quantity = typeof searchParams.quantity === "string" ? searchParams.quantity : undefined;
  const attrs = typeof searchParams.attrs === "string" ? searchParams.attrs : undefined;

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-6 text-2xl font-bold">{t("Checkout")}</h1>
      <CheckoutFlow buyNow={buyNow} quantity={quantity} attrs={attrs} />
    </div>
  );
}

import type { Metadata } from "next";
import { MockPayPanel } from "@/components/shop/mock-pay-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mock payment",
  robots: { index: false, follow: false },
};

interface MockPayPageProps {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 模拟支付页（服务端壳）。
 *
 * 拆成「服务端壳 + 客户端面板」的原因：游客订单的查询令牌在 query 上，
 * 需要服务端读出后透传给面板；面板是客户端组件，用 useSearchParams 会在
 * 构建期触发 Suspense 要求，用服务端壳最省事也最不容易出hydration 差异。
 */
export default async function MockPayPage(props: MockPayPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const orderNumber = Array.isArray(params.orderNumber)
    ? params.orderNumber[0]!
    : params.orderNumber;
  const rawToken = searchParams.token;
  const token = typeof rawToken === "string" ? rawToken : null;

  return <MockPayPanel orderNumber={orderNumber} token={token} />;
}

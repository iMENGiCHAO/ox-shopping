import type { Metadata } from "next";
import { CheckoutFlow } from "@/components/shop/checkout-flow";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/server/services/settings.service";
import type { ShopAddress } from "@/components/shop/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Fill in shipping info and submit your order",
  robots: { index: false, follow: false },
};

interface CheckoutPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 结账页（服务端外壳）。
 *
 * 为什么把登录态/地址簿/品牌标志在服务端取好再传给客户端：
 * 结账页是「用户马上要付钱」的页面，任何一次客户端补拉都会造成可见的内容跳动
 * （邮箱空一下再填上、地址簿按钮闪一下）。服务端一次取齐，首屏即为终态。
 *
 * 页面本身不渲染标题（原站结账页没有 h1，只有面包屑），故这里只做数据装配。
 */
export default async function CheckoutPage(props: CheckoutPageProps) {
  const searchParams = await props.searchParams;
  const buyNow = typeof searchParams.buyNow === "string" ? searchParams.buyNow : undefined;
  const quantity = typeof searchParams.quantity === "string" ? searchParams.quantity : undefined;
  const attrs = typeof searchParams.attrs === "string" ? searchParams.attrs : undefined;

  const [user, settings] = await Promise.all([getSessionUser(), getSiteSettings()]);

  // 已保存地址：登录用户可一键带入内联表单（原站对应「选择已存地址」）
  let savedAddresses: ShopAddress[] = [];
  if (user) {
    const rows = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: 5,
    });
    savedAddresses = rows.map((a) => ({
      id: a.id,
      recipientName: a.recipientName,
      phone: a.phone,
      province: a.province,
      city: a.city,
      district: a.district,
      detail: a.detail,
      line2: a.line2,
      country: a.country,
      postalCode: a.postalCode,
      isDefault: a.isDefault,
    }));
  }

  return (
    <CheckoutFlow
      buyNow={buyNow}
      quantity={quantity}
      attrs={attrs}
      logoUrl={settings.siteLogoUrl || "/images/brand/logo.png"}
      /*
       * 反相判定：店铺默认 Logo 是为纯黑页头准备的**白色图案**，
       * 而结账页是白底（对齐原站），直接放会「白图压白底」看不见。
       * 服务端已测定商家上传图案的明暗并写入 siteLogoDarkArtwork，
       * 因此「图案不偏暗」时反相 —— 与页头的判定方向相反，但同源。
       */
      logoInvert={!settings.siteLogoDarkArtwork}
      signedIn={!!user}
      defaultEmail={user?.email ?? ""}
      savedAddresses={savedAddresses}
    />
  );
}

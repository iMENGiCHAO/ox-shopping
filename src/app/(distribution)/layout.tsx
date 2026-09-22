import * as React from "react";
import { redirect } from "next/navigation";
import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { CartProvider } from "@/components/shop/cart-provider";
import { CurrencyProvider } from "@/components/shop/currency-provider";
import { CartDrawer } from "@/components/shop/cart-drawer";
import { HeaderShell } from "@/components/shop/header-shell";
import { CookieConsent } from "@/components/shop/cookie-consent";
import { ShopLangProvider } from "@/components/shop/lang-provider";
import { DistributionTabs } from "@/components/shop/distribution/tabs";
import { getSessionUser } from "@/lib/auth/session";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { brandFallback } from "@/lib/env";

/**
 * 分销中心外壳（大爷 2026-09-20 两次反馈后的最终形态）。
 *
 * 演进过程值得写下来，免得以后又改回去：
 *   ① 最初把分销入口放进账户左侧导航 → 大爷：「污染主站、太杂乱」→ 移除，只留账户里的分享卡；
 *   ② 随后独立页面用了极简外壳（只有站名 + 返回店铺）→ 大爷：「样式太简单了，能不能跟原网站
 *      风格一样，只不过新开一个窗口」→ 本文件即这一版：**套用与商城完全相同的页头页脚与 Provider**。
 *
 * 所以「独立」体现在**功能与入口**（不占主站导航、不塞进账户页、从分享卡片新标签页打开、
 * 数据与权限独立），而**视觉**与商城保持一致 —— 复用 `(shop)/layout.tsx` 的同一批组件，
 * 只把 `<main>` 的内容换成分销二级导航 + 页面。
 *
 * 为什么不直接复用 `(shop)` 布局：那会连带套上账户左侧导航与店铺页面结构，
 * 又把两套东西搅在一起（大爷明确反对）。这里只复用**视觉外壳**，商城布局本身零改动。
 */
export const dynamic = "force-dynamic";

export default async function DistributionLayout({ children }: { children: React.ReactNode }) {
  // 分销中心是「本人经营数据」：未登录直接送登录页（带 next 回跳）
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=%2Fdistribution");

  const initialLang = await getLang();
  const t = await getT();
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, initialLang).trim() || brandFallback;

  return (
    <ShopLangProvider initialLang={initialLang} siteName={siteName}>
      <CartProvider>
        <CurrencyProvider>
          <div data-shop-root className="flex min-h-screen flex-col bg-card text-foreground">
            <a
              href="#distribution-main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
            >
              {t("Skip to content")}
            </a>
            <HeaderShell>
              <Header />
            </HeaderShell>
            <main id="distribution-main" className="flex flex-1 flex-col">
              {/* data-dist-center：只给这块内容区上现代圆角/柔影（页头页脚仍是商城原样） */}
              <div className="container py-8 md:py-10" data-dist-center>
                <header className="mb-6">
                  <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
                    {t("Distribution center")}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {t("Track your referrals, commission and payouts in one place.")}
                  </p>
                </header>
                <DistributionTabs />
                <div className="mt-8">{children}</div>
              </div>
            </main>
            <Footer />
            <CartDrawer />
            <CookieConsent />
          </div>
        </CurrencyProvider>
      </CartProvider>
    </ShopLangProvider>
  );
}

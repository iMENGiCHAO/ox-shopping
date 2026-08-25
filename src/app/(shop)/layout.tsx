import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { CartProvider } from "@/components/shop/cart-provider";
import { CurrencyProvider } from "@/components/shop/currency-provider";
import { CartDrawer } from "@/components/shop/cart-drawer";
import { HeaderShell } from "@/components/shop/header-shell";
import { ShopLangProvider } from "@/components/shop/lang-provider";
import { getLang } from "@/lib/shop-i18n-server";

// Header 依赖 cookie 判断登录态，商城前台页面全部动态渲染
export const dynamic = "force-dynamic";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  // Read the language preference on the server so SSR + client hydration agree.
  const initialLang = getLang();
  return (
    <ShopLangProvider initialLang={initialLang}>
      <CartProvider>
        <CurrencyProvider>
          <div className="flex min-h-screen flex-col bg-card text-foreground">
            {/* 无障碍：跳到主内容(文档 §7) */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
            >
              Skip to content
            </a>
            <HeaderShell>
              <Header />
            </HeaderShell>
            <main id="main-content" className="flex-1">{children}</main>
            <Footer />
            <CartDrawer />
          </div>
        </CurrencyProvider>
      </CartProvider>
    </ShopLangProvider>
  );
}

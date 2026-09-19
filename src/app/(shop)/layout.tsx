import { Header } from "@/components/shop/header";
import { Footer } from "@/components/shop/footer";
import { CartProvider } from "@/components/shop/cart-provider";
import { CurrencyProvider } from "@/components/shop/currency-provider";
import { CartDrawer } from "@/components/shop/cart-drawer";
import { HeaderShell } from "@/components/shop/header-shell";
import { CookieConsent } from "@/components/shop/cookie-consent";
import { ShopLangProvider } from "@/components/shop/lang-provider";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { brandFallback } from "@/lib/env";

// Header 依赖 cookie 判断登录态，商城前台页面全部动态渲染
export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  // Read the language preference on the server so SSR + client hydration agree.
  const initialLang = await getLang();
  const t = await getT();
  // 品牌名（站点设置，后台可改）注入客户端 Provider：
  // 需要品牌的客户端文案走 t("... {brand} ...", { brand: siteName })，组件内不留字面量。
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, initialLang).trim() || brandFallback;
  return (
    <ShopLangProvider initialLang={initialLang} siteName={siteName}>
      <CartProvider>
        <CurrencyProvider>
          {/* data-shop-root：店铺前台作用域锚点。
              globals.css 借它把 .container 的断点封顶改成 --shell-max 收敛，
              后台（admin）不受影响。 */}
          <div data-shop-root className="flex min-h-screen flex-col bg-card text-foreground">
            {/* 无障碍：跳到主内容(文档 §7) */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
            >
              {t("Skip to content")}
            </a>
            <HeaderShell>
              <Header />
            </HeaderShell>
            {/* main 用 flex 列布局：页面根节点可加 `flex-1` 撑满剩余高度，
                短内容页面（如 /collections）的整块底色才能一直铺到页脚。
                块级布局下 `min-h-full` 无法解析（父高度由 flex 决定）。 */}
            <main id="main-content" className="flex flex-1 flex-col">
              {children}
            </main>
            <Footer />
            <CartDrawer />
            {/* GDPR Cookie 横幅（README 宣称的合规功能）：同意状态与
                /policies/cookies 的重置按钮构成闭环；仅前台挂载，后台不受影响 */}
            <CookieConsent />
          </div>
        </CurrencyProvider>
      </CartProvider>
    </ShopLangProvider>
  );
}

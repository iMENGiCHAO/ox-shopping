import { CurrencyProvider } from "@/components/shop/currency-provider";
import { ShopLangProvider } from "@/components/shop/lang-provider";
import { getLang, getT } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { brandFallback } from "@/lib/env";

/**
 * 结账路由组的独立布局。
 *
 * 为什么结账页不套用 (shop) 布局：原站 上游参考站 的结账页是 Shopify checkout，
 * 页面**没有**店铺的页头（无 Logo 导航、无购物袋图标、无币种/语言切换）与页脚
 * （无 7 条链接），只有：
 *   - 左栏顶部一个 X 标志（点击回店铺首页）
 *   - 页面底部两行法务链接 `Refund policy · Privacy policy`
 * 因此这里只挂必要的 Provider 与最外层底色，页头/页脚由结账页自己按原站形态渲染。
 *
 * 保留的 Provider：语言（文案）与币种（金额格式）。二者都由 cookie 驱动，
 * 用户从店铺页切到结账页时语言/币种必须延续，否则金额会突然换一种货币显示。
 */
export const dynamic = "force-dynamic";

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const initialLang = await getLang();
  const t = await getT();
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, initialLang).trim() || brandFallback;

  return (
    <ShopLangProvider initialLang={initialLang} siteName={siteName}>
      <CurrencyProvider>
        {/* data-shop-root：店铺前台作用域锚点（globals.css 借它收敛 .container 断点） */}
        <div data-shop-root className="flex min-h-screen flex-col bg-card text-foreground">
          <a
            href="#checkout-main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:text-foreground"
          >
            {t("Skip to content")}
          </a>
          <main id="checkout-main" className="flex flex-1 flex-col">
            {children}
          </main>
        </div>
      </CurrencyProvider>
    </ShopLangProvider>
  );
}

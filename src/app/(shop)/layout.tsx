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

/* ⚠️ 本路由段**刻意没有** `loading.tsx`（2026-09-22 大爷反馈后移除，勿加回）。
 *
 * 现象：打开/刷新店铺页时，先看到「黑色顶栏 + 黑色页脚挤在顶部、下方一整屏白」，
 * 而原站 上游参考站 打开就直接呈现内容。
 *
 * 根因：只要存在 `loading.tsx`，Next 就据其在 children 外包一层 Suspense 边界。
 * 当时 `(shop)/loading.tsx` 导出 `null` 当兜底 → 服务端先流式下发「外壳 + 空 fallback」，
 * 真实内容被塞进 `<template id="B:0">` 交给内联脚本二次注入。于是浏览器**首帧**就是
 * 「header 0→65、main 高 0、footer 紧贴 65→273、下方 627px 纯白」（1200×900 实测）。
 * 换骨架也治不了：原站没有任何骨架闪烁，任何 fallback 都是可见的中间态。
 *
 * 移除后的实测结果：响应 HTML 中挂起标记 `<!--$?-->` 由 1 个变为 **0 个**，真实内容
 * （如首页 `All Products`）出现在 `<main>` 内部而非 `<template>`，首帧即完整页面；
 * 客户端路由切换时旧页面保持可见直到新页面就绪（采样 54 点，main 高度最小值 1511，
 * 从未归零），同样不会白屏。
 *
 * 需要加载指示时请用**页面内** `<Suspense>` 精确框住慢区块，不要用整页兜底。 */

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
            {/* main 只做 flex 列布局，**不给 `flex-1`**。
                2026-09-21 对齐原站：原站短页面（购物车空态）页脚**紧跟内容**，
                页脚下方留白 —— 实测 375 下页脚 465..747、页高 748，视口 812 时下方 64px 白。
                此前给 main 加 `flex-1` 会把页脚顶到视口底（同视口下页脚顶变成 530），
                与原站差 65px。去掉后短页面与原站一致；`min-h-screen` 仍保留，
                保证底色铺满视口（视觉结果与原站相同：都是"页脚之下留白"）。
                ⚠️ 页面根节点上的 `flex-1` 从此不再有撑高效果（如 /coupons），
                需要整块底色铺到页脚时改用 `min-h-[...]` 显式给高度。 */}
            <main id="main-content" className="flex flex-col">
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

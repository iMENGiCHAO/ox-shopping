import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { headers } from "next/headers";
import { getLang } from "@/lib/shop-i18n-server";
import "./globals.css";

/*
 * Typography: system Helvetica/Arial stack (see tailwind.config.ts).
 * No webfont download — zero render-blocking, zero build-time network
 * dependency, and it is exactly the shop.x.com look (regular weight).
 */

export const metadata: Metadata = {
  // OG/Twitter 图片绝对地址基准；未配置域名时回落本地
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  icons: {
      icon: "/images/brand/favicon.png",
      apple: "/images/brand/favicon.png",
    },
  title: {
    default: "Official Ox Shopping",
    template: "%s | Official Ox Shopping",
  },
  description:
    "Official Ox Shopping — official apparel and accessories. Tees, hoodies, hats, drinkware and more.",
  keywords: ["Ox Shopping", "Grok", "X", "shop", "store", "apparel", "tee", "hoodie"],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Official Ox Shopping",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // <html lang> 跟随 getLang()：默认 en，选 CNY 时自动 zh
  // 让浏览器 TTS / 翻译扩展 / 屏幕阅读器拿到正确语种
  const lang = await getLang();
  // 后台路由挂 admin-theme（作用域化设计令牌，SSR 阶段即生效，Radix 弹层经 body 继承）
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <html lang={lang} className={isAdmin ? "admin-theme" : undefined}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster position="top-center" toastOptions={{ unstyled: false }} />
      </body>
    </html>
  );
}

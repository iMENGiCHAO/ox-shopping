import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { headers } from "next/headers";
import { getLang } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import "./globals.css";

/*
 * Typography: system Helvetica/Arial stack (see tailwind.config.ts).
 * No webfont download — zero render-blocking, zero build-time network
 * dependency, and it is exactly the shop.x.com look (regular weight).
 */

const FALLBACK_NAME = "Official Ox Shopping";
const FALLBACK_DESCRIPTION =
  "Official Ox Shopping — official apparel and accessories. Tees, hoodies, hats, drinkware and more.";
const FALLBACK_KEYWORDS = [
  "Ox Shopping",
  "Grok",
  "X",
  "shop",
  "store",
  "apparel",
  "tee",
  "hoodie",
];

/** 动态站点元信息：后台「站点设置」的站名/描述/SEO关键词直达 <head>，消除信息孤岛 */
export async function generateMetadata(): Promise<Metadata> {
  // 后台路由不读站点设置（避开头/正文重复查询），留默认 SEO
  const settings = await getSiteSettings();
  const lang = await getLang();

  const siteName = pickLang(settings.siteName, lang) || FALLBACK_NAME;
  const description =
    pickLang(settings.siteDescription, lang) || FALLBACK_DESCRIPTION;
  const kwRaw = settings.seoKeywords?.trim() ?? "";
  // 后台 SEO 关键词用逗号分隔；未配置时回落默认
  const keywordParts = kwRaw
    ? kwRaw
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : FALLBACK_KEYWORDS;
  const keywords = keywordParts.slice(0, 10);

  return {
    metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
    icons: {
      icon: "/images/brand/favicon.png",
      apple: "/images/brand/favicon.png",
    },
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    keywords,
    openGraph: {
      type: "website",
      locale: lang === "zh" ? "zh_CN" : "en_US",
      siteName,
      description,
    },
    robots: { index: true, follow: true },
  };
}

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

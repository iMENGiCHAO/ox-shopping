import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { headers } from "next/headers";
import { getLang } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { env, brandFallback } from "@/lib/env";
import "./globals.css";

/*
 * Typography: system Helvetica/Arial stack (see tailwind.config.ts).
 * No webfont download — zero render-blocking, zero build-time network
 * dependency, and it is exactly the 上游参考站 look (regular weight).
 */

// SEO 兜底：仅在后台「站点设置」未填写时生效。品牌名统一取 brandFallback，
// 不在此处写死 —— 改名只需改环境变量 SITE_NAME 或后台设置。
const FALLBACK_NAME = brandFallback;
const FALLBACK_DESCRIPTION = `${brandFallback} — official apparel and accessories. Tees, hoodies, hats, drinkware and more.`;
const FALLBACK_KEYWORDS = [
  brandFallback,
  "official",
  "shop",
  "store",
  "apparel",
  "accessories",
  "tee",
  "hoodie",
];

/** 动态站点元信息：后台「站点设置」的站名/描述/SEO关键词直达 <head>，消除信息孤岛 */
export async function generateMetadata(): Promise<Metadata> {
  // 后台路由不读站点设置（避开头/正文重复查询），留默认 SEO
  const settings = await getSiteSettings();
  const lang = await getLang();
  const base = new URL(env.SITE_URL);

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

  // hreflang alternates（P1-1 第三步）：无前缀=en(canonical/x-default)，/zh=中文。
  // 由 proxy 注入 x-pathname（原始路径，保留 /zh 前缀）反推成对 URL。
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isZhPath = pathname === "/zh" || pathname.startsWith("/zh/");
  const enPath = isZhPath ? pathname.slice(3) || "/" : pathname;
  const zhPath = isZhPath ? pathname : `/zh${pathname === "/" ? "" : pathname}`;
  const enUrl = new URL(enPath, base).toString();
  const zhUrl = new URL(zhPath, base).toString();

  return {
    metadataBase: base,
    icons: {
      // 标签栏使用深色(黑色)品牌 logo，才能在浏览器浅色标签栏上清晰可见；
      // favicon.png 为白色品牌 logo，仅用于 JSON-LD 结构化数据等 logo 展示场景。
      icon: "/images/brand/favicon-dark.png",
      apple: "/images/brand/favicon-dark.png",
    },
    title: {
      default: siteName,
      /* 原站实测（2026-09-20，Playwright 直连）：**所有页面的 `<title>` 都不带品牌后缀** ——
         `/collections/all` → `Products`、`/pages/faqs` → `FAQs`、`/cart` → `Your Shopping Cart`、
         `/collections` → `Collections`。
         此前这里是 `%s | ${siteName}`，会给每个子页面标题追加 `| 品牌名`，与原站不符。
         `default` 仍取站点名（原站首页标题就是店名，如 `Official Ox Shop`），
         只是**不再给子页面追加后缀**。 */
      template: "%s",
    },
    description,
    keywords,
    alternates: {
      canonical: enUrl,
      languages: {
        en: enUrl,
        zh: zhUrl,
        "x-default": enUrl,
      },
    },
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
        {/* 开发期 FOUC 骨架兜底（大爷 2026-10-09 反馈「加载时页脚下方露白」）：
            dev 下 Turbopack 的 CSS 由 JS chunk 注入、不阻塞首帧——SSR HTML 先绘制
            （探针实测露白帧 stylesheets=0、容器 display=block），此刻 flex/min-h-screen
            均未生效：页脚紧跟内容、下方露出 body 白底（短页最多露 700px+；另有
            <p> 的 UA 默认 margin 塌陷出页脚形成固定 16px 露白）。
            这份内联骨架让无样式帧也具备「容器满屏 flex 列 + main 拉伸 + 页脚贴底」
            的正确结构，白闪窗口内页脚不再悬空。选择器与 Tailwind 类同值
            （特异性同为 0-1-0，后注入者胜出），加载完成后被正常样式无缝接管。
            生产模式 CSS 走 <head> 阻塞式 <link>、首帧即带样式，无此问题；
            且内联 style 会撞生产的 per-request nonce CSP —— 故仅 dev 注入。 */}
        {process.env.NODE_ENV !== "production" && (
          <style
            href="dev-fouc-skeleton"
            precedence="dev-fouc"
          >{`body{margin:0}[data-shop-root]{display:flex;min-height:100vh;flex-direction:column}[data-shop-root]>main{flex:1 1 0%}`}</style>
        )}
        {children}
        <Toaster position="top-center" toastOptions={{ unstyled: false }} />
      </body>
    </html>
  );
}

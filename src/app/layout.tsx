import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

/*
 * Typography: system Helvetica/Arial stack (see tailwind.config.ts).
 * No webfont download — zero render-blocking, zero build-time network
 * dependency, and it is exactly the shop.x.com look (regular weight).
 */

export const metadata: Metadata = {
  // OG/Twitter 图片绝对地址基准；未配置域名时回落本地
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Official SpaceXAI Shop",
    template: "%s | Official SpaceXAI Shop",
  },
  description:
    "Official SpaceXAI Shop — official apparel and accessories. Tees, hoodies, hats, drinkware and more.",
  keywords: ["SpaceXAI", "Grok", "X", "shop", "store", "apparel", "tee", "hoodie"],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Official SpaceXAI Shop",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
        <Toaster position="top-center" toastOptions={{ unstyled: false }} />
      </body>
    </html>
  );
}

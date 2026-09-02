import Link from "next/link";
import { CurrencySelect } from "@/components/shop/currency-select";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";

/* shop.x.com footer — exact link list, order and labels */
const FOOTER_LINKS: { href: string; labelKey: string }[] = [
  { href: "/pages/faqs", labelKey: "FAQs" },
  { href: "/search", labelKey: "Search" },
  { href: "/pages/accessibility-statement", labelKey: "Accessibility Statement" },
  { href: "/policies/privacy", labelKey: "Privacy Policy" },
  { href: "/policies/terms", labelKey: "Terms and Conditions" },
  { href: "/policies/cookies", labelKey: "Cookie Consent" },
];

/**
 * Site footer — pure black, one centered row of faded links, then a centered
 * utility line (country/currency selector + brand + year).
 *
 * 站名/版权统一从 SiteSetting 读取（管理员可在后台修改 siteName / icp），
 * 之前硬编码 "X Corp © 2024" 与 Ox Shopping 品牌脱节，已修复。
 */
export async function Footer() {
  const t = await getT();
  const lang = await getLang();
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, lang);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="container pt-16 pb-16 text-center">
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[15px] leading-[24.75px] opacity-65 outline-none transition-opacity hover:opacity-100 focus-visible:[outline:none] focus-visible:[box-shadow:none] focus-visible:underline focus-visible:underline-offset-4"
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="mx-auto mt-10 flex w-fit flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
          <CurrencySelect showCountry align="center" direction="up" />
          <p className="text-xs opacity-65">
            © {year} {siteName}
            {settings.icp ? ` · ${settings.icp}` : null}
          </p>
        </div>
      </div>
    </footer>
  );
}

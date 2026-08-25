import Link from "next/link";
import { CurrencySelect } from "@/components/shop/currency-select";
import { getT } from "@/lib/shop-i18n-server";

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
 * Site footer — faithful shop.x.com replica: pure black, one centered row
 * of faded links (forced centered on the live site via inline CSS), then a
 * centered utility line (country/currency selector · "X Corp © 2024").
 */
export async function Footer() {
  const t = getT();

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
          <p className="text-xs opacity-65">X Corp © 2024</p>
        </div>
      </div>
    </footer>
  );
}

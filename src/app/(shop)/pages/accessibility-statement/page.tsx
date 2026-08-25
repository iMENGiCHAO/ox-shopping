import type { Metadata } from "next";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Accessibility Statement" };
}

/** Accessibility statement — mirrors shop.x.com/pages/accessibility-statement intent */
export default function AccessibilityPage() {
  const t = getT();
  return (
    <div className="container max-w-3xl py-16">
      <h1 className="text-[28px] font-normal leading-tight text-foreground">
        {t("Accessibility Statement")}
      </h1>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/85">
        <p>
          We are committed to making our website usable by everyone, including people with
          disabilities. We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1
          Level AA and follow general best practices for accessible design.
        </p>
        <p>
          The site is designed to work with screen readers, keyboard navigation and common
          assistive technologies. Text alternatives are provided for meaningful imagery, focus
          states are visible throughout the interface, and color contrast meets minimum
          readability thresholds.
        </p>
        <p>
          If you experience any difficulty accessing or using this store, please contact us and
          describe the issue along with the page address. We take feedback seriously and will do
          our best to provide the content you need through an alternative method.
        </p>
      </div>
    </div>
  );
}

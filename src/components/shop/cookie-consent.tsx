"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/shop/lang-provider";

const CONSENT_KEY = "cookie-consent";

/** Cookie consent banner: shown when localStorage has no record; resettable on /policies/cookies */
export function CookieConsent() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {
      /* private mode ignore */
    }
  }, []);

  if (!visible) return null;

  const accept = (value: "all" | "necessary") => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* ignore write failure */
    }
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-center text-sm text-muted-foreground sm:text-left">
          {t("We use cookies to improve your browsing experience and analyze traffic. Clicking \"Accept all\" means you agree to our use of")}{" "}
          <Link href="/policies/cookies" className="underline underline-offset-2">
            {t("Cookie Policy")}
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={() => accept("necessary")}>
            {t("Necessary only")}
          </Button>
          <Button size="sm" onClick={() => accept("all")}>
            {t("Accept all")}
          </Button>
        </div>
      </div>
    </div>
  );
}

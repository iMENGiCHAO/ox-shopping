"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/shop/lang-provider";

const CONSENT_KEY = "cookie-consent";

/**
 * Cookie consent banner: shown when localStorage has no record; resettable on /policies/cookies.
 *
 * 页脚「Cookie Consent」按原站实测指向 `?preview_privacy_banner=1`（原站点击该链接
 * 会重新唤起同意横幅，而不是打开政策页）——该链接用原生 <a> 全页导航（见 footer.tsx
 * 的 hard 链接），组件挂载时读取 query 强制展示，供用户随时改选。
 * 注意：这里刻意不用 useSearchParams（它会让整棵子树在静态渲染下 bailout 成
 * fallback，实测横幅会完全不渲染）。
 */
export function CookieConsent() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const forceOpen =
        new URLSearchParams(window.location.search).get("preview_privacy_banner") === "1";
      if (forceOpen || !localStorage.getItem(CONSENT_KEY)) setVisible(true);
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
          {t(
            'We use cookies to improve your browsing experience and analyze traffic. Clicking "Accept all" means you agree to our use of cookies. See our',
          )}{" "}
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

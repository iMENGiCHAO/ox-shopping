"use client";

import { useEffect, useState } from "react";
import { detectLang, ERROR_COPY, type Lang } from "@/lib/error-copy";

/**
 * 账户中心错误边界 — 比 root 错误页更聚焦。
 * 文案按当前语言渲染（不写死中文）；账户中心用后台主题的圆角与尺寸。
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(detectLang()), []);

  useEffect(() => {
    console.error("[account-error]", error.digest ?? error.message);
  }, [error]);

  const c = ERROR_COPY[lang];

  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/[0.04] p-6 text-center">
      <h2 className="text-sm font-medium text-foreground">{c.accountTitle}</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {c.accountBody}
        {error.digest && (
          <span className="mt-1 block font-mono opacity-60">
            {c.errorIdLabel}
            {error.digest}
          </span>
        )}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {c.retry}
        </button>
        <a
          href="/account"
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          {c.accountHome}
        </a>
      </div>
    </div>
  );
}

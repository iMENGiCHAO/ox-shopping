"use client";

import { useEffect } from "react";

/**
 * 账户中心错误边界 — 比 root 错误页更聚焦
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[account-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/[0.04] p-6 text-center">
      <h2 className="text-sm font-medium text-foreground">账户页面加载失败</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        请稍后重试。如果问题持续，请联系客服。
        {error.digest && (
          <span className="mt-1 block font-mono opacity-60">编号：{error.digest}</span>
        )}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          重试
        </button>
        <a
          href="/account"
          className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          回到账户首页
        </a>
      </div>
    </div>
  );
}

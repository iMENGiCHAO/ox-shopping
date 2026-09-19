"use client";

import { useEffect, useState } from "react";
import { detectLang, ERROR_COPY, type Lang } from "@/lib/error-copy";

/**
 * 全局错误边界 — 渲染异常时给出可恢复出口（重试 / 返回首页），
 * 视觉遵循品牌黑白极简。
 *
 * 文案按当前语言（shop-lang cookie / 浏览器语言）渲染，
 * 不写死中文；配色走设计令牌而非硬编码色值。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => setLang(detectLang()), []);

  useEffect(() => {
    console.error("[app-error]", error.digest ?? error.message);
  }, [error]);

  const c = ERROR_COPY[lang];

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center text-foreground">
      <h1 className="text-lg font-normal">{c.title}</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70">
        {c.body}
        {error.digest && (
          <span className="mt-2 block font-mono text-xs opacity-50">
            {c.errorIdLabel}
            {error.digest}
          </span>
        )}
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[46px] items-center justify-center bg-primary px-8 text-[15px] text-primary-foreground transition-opacity hover:opacity-85"
        >
          {c.retry}
        </button>
        <a
          href="/"
          className="inline-flex h-[46px] items-center justify-center border border-border bg-card px-8 text-[15px] text-foreground transition-colors hover:bg-secondary"
        >
          {c.home}
        </a>
      </div>
    </div>
  );
}

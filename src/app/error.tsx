"use client";

import { useEffect } from "react";

/**
 * 全局错误边界 — 渲染异常时给出可恢复出口（重试 / 返回首页），
 * 视觉遵循品牌黑白极简。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center text-foreground">
      <h1 className="text-lg font-normal">页面出错了</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70">
        系统遇到了一个意外错误，请稍后重试。
        {error.digest && (
          <span className="mt-2 block font-mono text-xs opacity-50">错误编号：{error.digest}</span>
        )}
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[46px] items-center justify-center bg-[#1C1C1C] px-8 text-[15px] text-white transition-opacity hover:opacity-85"
        >
          重试
        </button>
        <a
          href="/"
          className="inline-flex h-[46px] items-center justify-center border border-border bg-card px-8 text-[15px] text-foreground transition-colors hover:bg-secondary"
        >
          返回首页
        </a>
      </div>
    </div>
  );
}

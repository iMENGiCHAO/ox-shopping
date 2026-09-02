"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * 后台错误边界 — 后台异常时给出"重试 / 返回仪表盘"出口，
 * 视觉与 admin-shell 一致。
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <div className="rounded-md border border-destructive/20 bg-destructive/[0.04] px-8 py-6">
        <h1 className="text-base font-medium text-foreground">后台操作失败</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          系统遇到了一个意外错误，可能是网络异常或后端服务暂时不可用。
          {error.digest && (
            <span className="mt-2 block font-mono text-xs opacity-60">错误编号：{error.digest}</span>
          )}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset} size="sm">
            重试
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/admin">返回仪表盘</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

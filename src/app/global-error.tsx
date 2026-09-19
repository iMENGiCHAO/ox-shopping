"use client";

import { useEffect, useState } from "react";
import { detectLang, ERROR_COPY, type Lang } from "@/lib/error-copy";

/**
 * 根级错误边界（global-error）—— 当根布局本身崩溃时启用，必须自带 <html>/<body>。
 * 普通页面错误由 app/error.tsx 处理。
 *
 * 这里不能依赖任何 Provider / 全局样式表，故用内联样式；
 * 文案按 shop-lang cookie / 浏览器语言切换，不再写死单一语言。
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
  const c = ERROR_COPY[lang];

  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fff",
          color: "#1c1c1c",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>{c.title}</h1>
          <p style={{ marginTop: 12, fontSize: 14, opacity: 0.7 }}>{c.body}</p>
          {error?.digest ? (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.5 }}>
              {c.errorIdLabel}
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 28,
              height: 46,
              padding: "0 32px",
              background: "#1c1c1c",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 15,
            }}
          >
            {c.retry}
          </button>
        </div>
      </body>
    </html>
  );
}

"use client";

/**
 * 根级错误边界（global-error）——当根布局本身崩溃时启用，
 * 必须自带 <html>/<body>。普通页面错误由 app/error.tsx 处理。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
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
          <h1 style={{ fontSize: 18, fontWeight: 500 }}>Something went wrong</h1>
          <p style={{ marginTop: 12, fontSize: 14, opacity: 0.7 }}>
            We&apos;re fixing it. Please try again in a moment.
          </p>
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
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}

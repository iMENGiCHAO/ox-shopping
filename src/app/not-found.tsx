import Link from "next/link";
import { getT } from "@/lib/shop-i18n-server";

/**
 * 404 — shop.x.com 式：白底居中，18px 常规字重标题 + 说明 + 方角黑色返回按钮。
 */
export default function NotFound() {
  const t = getT();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-white px-5 text-center text-foreground">
      <h1 className="text-lg font-normal tracking-[0.02em]">404</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed opacity-70">
        {t("The page you requested does not exist.")}
      </p>
      <Link
        href="/"
        className="btn-sweep mt-8 inline-flex h-[46px] items-center justify-center border border-border bg-card px-10 text-[15px] text-foreground"
      >
        {t("Back to home")}
      </Link>
    </div>
  );
}

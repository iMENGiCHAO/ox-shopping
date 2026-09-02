import type { ReactNode } from "react";
import { getT } from "@/lib/shop-i18n-server";

/** Policy page shared layout (server) */
export async function PolicyPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  const t = await getT();
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("Last updated:")} {updatedAt}</p>
      {/* 官方样式:无边框卡片,正文直接排版 */}
      <div className="max-w-none space-y-4 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_p]:my-2 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

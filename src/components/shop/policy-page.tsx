import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getT } from "@/lib/shop-i18n-server";

/** Policy page shared layout (server) */
export function PolicyPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  const t = getT();
  return (
    <div className="container max-w-3xl py-10">
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("Last updated:")} {updatedAt}</p>
      <Card>
        <CardContent className="prose-sm max-w-none space-y-4 leading-relaxed text-muted-foreground [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_p]:my-2 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

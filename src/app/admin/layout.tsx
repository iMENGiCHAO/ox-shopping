import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/admin-shell";
import { LangProvider, type Lang } from "@/components/admin/lang-provider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Console",
  robots: { index: false, follow: false },
};

/** Admin layout: auth/role guard + sidebar shell + i18n provider */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // /admin/login is inside this layout scope — must bypass guard (else infinite redirect)
  const pathname = headers().get("x-pathname") ?? "";
  const isLoginPage = pathname === "/admin/login";

  // SSR 阶段从 Cookie 读语言，管理端首渲染即是用户语言（避免英文闪烁/测试断言漂移）
  const cookieLang = cookies().get("admin-lang")?.value;
  const initialLang: Lang = cookieLang === "zh" || cookieLang === "en" ? cookieLang : "en";

  const user = await getSessionUser();
  if (!isLoginPage && (!user || (user.role !== "ADMIN" && user.role !== "SUPPORT"))) {
    redirect("/admin/login");
  }

  if (isLoginPage) {
    // Logged-in admins hitting /admin/login are redirected to the dashboard
    if (user && (user.role === "ADMIN" || user.role === "SUPPORT")) {
      redirect("/admin");
    }
    return <LangProvider initialLang={initialLang}>{children}</LangProvider>;
  }

  return (
    <LangProvider initialLang={initialLang}>
      <AdminShell user={user!}>{children}</AdminShell>
    </LangProvider>
  );
}

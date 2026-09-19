import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { AdminShellServer } from "@/components/admin/admin-shell-server";
import { LangProvider, type Lang } from "@/components/admin/lang-provider";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getLang } from "@/lib/shop-i18n-server";
import { brandFallback } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "管理后台",
  robots: { index: false, follow: false },
};

/** Admin layout: auth/role guard + sidebar shell + i18n provider */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // /admin/login is inside this layout scope — must bypass guard (else infinite redirect)
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isLoginPage = pathname === "/admin/login";

  // SSR 阶段从 Cookie 读语言，管理端首渲染即是用户语言（避免英文闪烁/测试断言漂移）
  const cookieLang = (await cookies()).get("admin-lang")?.value;
  const initialLang: Lang = cookieLang === "zh" || cookieLang === "en" ? cookieLang : "en";

  // 品牌名：与前台同源（站点设置，后台可改）→ 注入客户端 Provider，
  // 供登录页标题、设置页占位符等客户端组件使用（它们读不到站点设置）。
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, await getLang()).trim() || brandFallback;

  const user = await getSessionUser();
  if (!isLoginPage && (!user || (user.role !== "ADMIN" && user.role !== "SUPPORT"))) {
    redirect("/admin/login");
  }

  if (isLoginPage) {
    // Logged-in admins hitting /admin/login are redirected to the dashboard
    if (user && (user.role === "ADMIN" || user.role === "SUPPORT")) {
      redirect("/admin");
    }
    return (
      <LangProvider initialLang={initialLang} siteName={siteName}>
        {children}
      </LangProvider>
    );
  }

  return (
    <LangProvider initialLang={initialLang} siteName={siteName}>
      <AdminShellServer user={user!}>{children}</AdminShellServer>
    </LangProvider>
  );
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AccountNavLink, type AccountNavIcon } from "@/components/shop/account-nav-link";
import { getT } from "@/lib/shop-i18n-server";
import { AccountLogoutButton } from "@/components/shop/account-logout-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Account layout (server guard for login state) */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");
  // redirect() 在 next/* .d.ts 缺失时不被识别为 never，显式 throw 帮 TS narrow
  if (!user) throw new Error("unreachable");
  const t = await getT();

  const NAV: { href: string; label: string; shortLabel?: string; icon: AccountNavIcon }[] = [
    { href: "/account/profile", label: t("Profile"), shortLabel: t("Profile"), icon: "user" },
    { href: "/account/notifications", label: t("Notifications"), shortLabel: t("Inbox"), icon: "bell" },
    {
      href: "/account/addresses",
      label: t("Shipping Address"),
      shortLabel: t("Address"),
      icon: "map-pin",
    },
    {
      href: "/account/password",
      label: t("Change Password"),
      shortLabel: t("Password"),
      icon: "lock",
    },
    { href: "/orders", label: t("My Orders"), shortLabel: t("Orders"), icon: "orders" },
    {
      href: "/account/favorites",
      label: t("My Favorites"),
      shortLabel: t("Favorites"),
      icon: "heart",
    },
    { href: "/account/coupons", label: t("My Coupons"), shortLabel: t("Coupons"), icon: "ticket" },
  ];

  return (
    <div className="container py-6 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl font-bold md:text-2xl">{t("My Account")}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground md:mt-1 md:text-sm">
          {user.name} · {user.email}
        </p>
      </div>
      {/* 导航：移动端横向滚动 + 桌面端左侧栏 */}
      <div className="grid gap-6 md:grid-cols-[220px_1fr] md:gap-8">
        <nav
          className={cn(
            "flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible",
            "md:sticky md:top-20 md:self-start",
          )}
          aria-label={t("Account navigation")}
        >
          {NAV.map((item) => (
            <AccountNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              shortLabel={item.shortLabel}
              icon={item.icon}
            />
          ))}
          <div className="ml-auto shrink-0 pl-2 md:ml-0 md:mt-3 md:border-t md:border-border md:pl-0 md:pt-3">
            <AccountLogoutButton />
          </div>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

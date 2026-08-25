import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AccountNavLink, type AccountNavIcon } from "@/components/shop/account-nav-link";
import { getT } from "@/lib/shop-i18n-server";

export const dynamic = "force-dynamic";

/** Account layout (server guard for login state) */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");
  const t = getT();

  const NAV: { href: string; label: string; icon: AccountNavIcon }[] = [
    { href: "/account/profile", label: t("Profile"), icon: "user" },
    { href: "/account/addresses", label: t("Shipping Address"), icon: "map-pin" },
    { href: "/account/password", label: t("Change Password"), icon: "lock" },
    { href: "/account/coupons", label: t("My Coupons"), icon: "ticket" },
  ];

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("My Account")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.name} · {user.email}
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <nav
          className="flex flex-col gap-1 md:sticky md:top-20 md:self-start"
          aria-label={t("Account navigation")}
        >
          {NAV.map((item) => (
            <AccountNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

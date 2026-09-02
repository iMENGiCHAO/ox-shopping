import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AccountNavLink, type AccountNavIcon } from "@/components/shop/account-nav-link";
import { getT } from "@/lib/shop-i18n-server";
import { AccountLogoutButton } from "@/components/shop/account-logout-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 共享的"账户中心 + 导航"layout。
 *
 * 业务背景：原 `/(shop)/account` 路径组有 layout，但订单页面原本在
 * `/(shop)/orders`——这导致点击 "My Orders" 时丢失左侧菜单。
 *
 * 解法：给 `/orders` 也包一个 layout，复用相同导航结构。
 * 未来要加新"账户类"页面（/refunds /notifications 等），
 * 都可以让它们引用这个 layout。
 *
 * 响应式策略（移动端友好）：
 *   - 移动端（<md）：横向滚动条 + 紧凑行高
 *   - 桌面端（≥md）：左侧 220px 固定列 + 右侧 1fr
 *   - 退出按钮：移动端跟随菜单横向展示
 */
async function AccountShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/orders");
  // redirect() 在 next/* .d.ts 缺失时不被识别为 never，显式 throw 帮 TS narrow
  if (!user) throw new Error("unreachable");
  const t = await getT();

  const NAV: { href: string; label: string; shortLabel?: string; icon: AccountNavIcon }[] = [
    { href: "/account/profile", label: t("Profile"), shortLabel: t("Profile"), icon: "user" },
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
      href: "/account/notifications",
      label: t("Notifications"),
      shortLabel: t("Inbox"),
      icon: "bell",
    },
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
      {/* 顶部：账户标题（小屏紧凑） */}
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
            // 移动端：横向滚动容器 + 隐藏滚动条（不破坏布局）
            "flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible",
            // 移动端：sticky 在顶栏下方，滚动时保持可见
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
          {/* 退出按钮：移动端跟随导航，桌面端独立底部 */}
          <div className="ml-auto shrink-0 pl-2 md:ml-0 md:mt-3 md:border-t md:border-border md:pl-0 md:pt-3">
            <AccountLogoutButton />
          </div>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export default AccountShell;

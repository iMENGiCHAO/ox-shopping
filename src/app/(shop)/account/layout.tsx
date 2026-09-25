import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AccountNavLink } from "@/components/shop/account-nav-link";
import { getT } from "@/lib/shop-i18n-server";
import { AccountLogoutButton } from "@/components/shop/account-logout-button";
import { buildAccountNav } from "@/lib/account-nav";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Account layout (server guard for login state) */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?next=/account");
  // redirect() 在 next/* .d.ts 缺失时不被识别为 never，显式 throw 帮 TS narrow
  if (!user) throw new Error("unreachable");
  const t = await getT();

  // 统一账户导航（与 /orders 布局共用同一份定义，顺序一致）：
  // 个人资料 → 收货地址 → 我的订单 → 消息通知（修改密码已并入个人资料页）
  const NAV = buildAccountNav(t);

  // data-apple-area：账户区中间内容（导航 + 正文）整体换成 Apple 风格令牌
  // （#F5F5F7 灰底圆角面板 + 白卡大圆角 + Apple 蓝主色），顶栏/底栏保持
  // 上游参考站 黑白方角不变（见 globals.css 作用域注释）。
  return (
    <div className="container my-6 p-4 md:my-8 md:p-6" data-apple-area>
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

import { getSessionUser } from "@/lib/auth/session";
import { AccountNavLink } from "@/components/shop/account-nav-link";
import { getT } from "@/lib/shop-i18n-server";
import { AccountLogoutButton } from "@/components/shop/account-logout-button";
import { buildAccountNav } from "@/lib/account-nav";
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
  const t = await getT();

  // 游客订单详情使用 ?token= 自行鉴权，不能被父 layout 的登录门禁提前拦截。
  // 订单列表页自身仍会在未登录时 redirect；游客详情则直接使用独立订单页面外壳。
  if (!user) return <>{children}</>;

  // 统一账户导航（与 /account 布局共用同一份定义，顺序一致）：
  // 个人资料 → 收货地址 → 我的订单 → 消息通知（修改密码已并入个人资料页）
  const NAV = buildAccountNav(t);

  // data-apple-area：订单页与 /account 共用同一套账户外壳，内容区域同步换成
  // Apple 风格令牌（灰底圆角面板 + 白卡大圆角），顶栏/底栏保持 shop.x.com 不变。
  return (
    <div className="container my-6 p-4 md:my-8 md:p-6" data-apple-area>
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

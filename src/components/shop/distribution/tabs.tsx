"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";

/**
 * 分销中心二级导航。
 *
 * 样式**刻意与账户左侧导航（`AccountNavLink`）完全一致** —— 大爷要的是
 * 「跟原网站风格一样，只不过新开一个窗口」，所以这里用同一套：
 *   · 激活态 `bg-primary text-primary-foreground`（黑底白字）
 *   · 非激活 `text-muted-foreground hover:bg-accent`
 *   · 同一个圆角/内边距/字号（`rounded-md px-3 py-2 text-sm font-medium`）
 * 移动端横向滚动、桌面端一行铺开，和商城账户导航的表现形式一致。
 *
 * 只放「分销商真正会反复看的东西」：概览 / 客户 / 订单 / 团队 / 佣金 / 提现 / 业绩。
 * 大爷反对「里面什么都有、很杂乱」，所以不做左侧大导航、不做仪表盘。
 */
const TABS: { href: string; key: string }[] = [
  { href: "/distribution", key: "Overview" },
  { href: "/distribution/customers", key: "My Customers" },
  { href: "/distribution/orders", key: "My Orders" },
  { href: "/distribution/subordinates", key: "My Team" },
  { href: "/distribution/commissions", key: "Commissions" },
  { href: "/distribution/withdrawals", key: "Withdrawals" },
  { href: "/distribution/team", key: "Team Performance" },
  // 规则说明放最后：新分销商第一眼看到数据，想搞清规则时再进来（大爷要求"要有详细说明"）
  { href: "/distribution/rules", key: "How it works" },
];

export function DistributionTabs() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label={t("Distribution center")}
      className="flex flex-row gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/distribution"
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-active={active}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}

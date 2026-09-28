import type { AccountNavIcon } from "@/components/shop/account-nav-link";

/**
 * 账户左侧导航统一定义 —— /account 与 /orders 两处布局共用同一份，
 * 保证「我的订单」等入口在两侧菜单顺序完全一致（大爷反馈：orders 布局曾把
 * My Orders 放到顶行导致顺序跳变）。
 *
 * 修改密码已并入个人资料页（/account/profile 的 Change Password 卡片），不再单列。
 * 分销/推广**刻意不在这里列入口**（大爷 2026-09-20 反馈：会在主站左侧多出一个「我的推广」，
 * 显得杂乱且污染主站）——它只是个人资料页里的一张分享小卡片，成功后从卡片进入独立的
 * `/distribution` 页面（自带外壳，不套店铺页头页脚）。
 */
export interface AccountNavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: AccountNavIcon;
}

export function buildAccountNav(t: (key: string) => string): AccountNavItem[] {
  return [
    { href: "/account/profile", label: t("Profile"), shortLabel: t("Profile"), icon: "user" },
    {
      href: "/account/addresses",
      label: t("Shipping Address"),
      shortLabel: t("Address"),
      icon: "map-pin",
    },
    { href: "/orders", label: t("My Orders"), shortLabel: t("Orders"), icon: "orders" },
    { href: "/account/coupons", label: t("My Coupons"), shortLabel: t("Coupons"), icon: "ticket" },
    {
      href: "/account/notifications",
      label: t("Notifications"),
      shortLabel: t("Inbox"),
      icon: "bell",
    },
  ];
}

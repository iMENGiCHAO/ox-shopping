"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * 分销模块二级导航。
 *
 * 侧栏只占一个「分销」入口，但模块内有 7 个页面（总览/分销商/关系链/规则/流水/提现/报表），
 * 彼此是同一批运维动作的不同视图，靠侧栏逐个跳转会把侧栏撑爆 —— 因此在这里做横向二级 Tab。
 * 风控视图与升级记录同属"看异常/看变化"，放在最后两个位置。
 */
const TABS = [
  { href: "/admin/distribution", label: "总览" },
  { href: "/admin/distribution/distributors", label: "分销商" },
  { href: "/admin/distribution/relations", label: "关系链" },
  { href: "/admin/distribution/rules", label: "佣金规则" },
  { href: "/admin/distribution/commissions", label: "佣金流水" },
  { href: "/admin/distribution/withdrawals", label: "提现审核" },
  { href: "/admin/distribution/reports", label: "对账报表" },
  { href: "/admin/distribution/rebinds", label: "换绑审核" },
  { href: "/admin/distribution/risk", label: "风控视图" },
  { href: "/admin/distribution/promotions", label: "升级记录" },
];

export default function AdminDistributionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        {TABS.map((tab) => {
          // 总览是精确匹配，否则 /admin/distribution 会吃掉所有子路由的激活态
          const active =
            tab.href === "/admin/distribution"
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-active={active}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring/40",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Coins,
  Copy,
  ImageDown,
  Network,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/shop/lang-provider";
import { apiFetch } from "@/lib/fetch-client";
import type { DistributionAccountSummary, DistributionIdentity } from "@/lib/distribution/contract";
import { cny } from "@/components/shop/distribution/format";
import { StatCard } from "@/components/shop/distribution/ui";

interface LinksResponse {
  identity: DistributionIdentity;
}

interface AccountResponse {
  account: DistributionAccountSummary;
  minWithdrawAmount: number;
}

/**
 * 分销概览。
 *
 * 「人人有链接」：未成为分销商的人也拿得到推广码（服务端惰性生成），
 * 所以这里不拦人，只把升级条件讲清楚 —— 转化路径越短越好。
 */
export default function DistributionOverviewPage() {
  const t = useT();
  const [identity, setIdentity] = useState<DistributionIdentity | null>(null);
  const [account, setAccount] = useState<DistributionAccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [links, acc] = await Promise.all([
        apiFetch<LinksResponse>("/api/distribution/my/links"),
        apiFetch<AccountResponse>("/api/distribution/my/account"),
      ]);
      setIdentity(links.identity);
      setAccount(acc.account);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 剪贴板在非安全上下文/无权限时会 reject，不能静默 —— 否则用户以为复制成功了 */
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Copied"));
    } catch {
      toast.error(t("Copy failed"));
    }
  };

  const entries = [
    {
      href: "/distribution/customers",
      icon: Users,
      title: t("My Customers"),
      description: t("Customers you personally referred."),
    },
    {
      href: "/distribution/orders",
      icon: ShoppingBag,
      title: t("My Orders"),
      description: t("Orders from your direct customers."),
    },
    {
      href: "/distribution/subordinates",
      icon: Network,
      title: t("My Subordinates"),
      description: t("People who signed up through your link."),
    },
    {
      href: "/distribution/commissions",
      icon: Coins,
      title: t("Commission Details"),
      description: t("Every commission you have earned."),
    },
    {
      href: "/distribution/withdrawals",
      icon: Wallet,
      title: t("Withdrawals"),
      description: t("Request a payout and track its status."),
    },
    {
      href: "/distribution/team",
      icon: BarChart3,
      title: t("Team Performance"),
      description: t("Daily performance of your whole team."),
    },
  ];

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      ) : !identity || !account ? (
        <p className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("Load failed")}
        </p>
      ) : (
        <>
          {!identity.isDistributor ? (
            <Card className="panel">
              <CardContent className="p-4">
                <p className="text-sm font-medium">{t("Become a distributor")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "Share your link — when someone signs up or orders through it, you become a distributor automatically.",
                  )}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("Available balance")} value={cny(account.balance)} />
            <StatCard label={t("Frozen")} value={cny(account.frozen)} />
            <StatCard label={t("Total settled")} value={cny(account.settledCommission)} />
            <StatCard label={t("Pending commission")} value={cny(account.pendingCommission)} />
          </div>

          <Card className="panel">
            <CardHeader>
              <CardTitle>{t("My promo code")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t("My promo code")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="border border-border bg-secondary px-2 py-1 text-sm">
                      {identity.referralCode}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copy(identity.referralCode)}
                    >
                      <Copy />
                      {t("Copy")}
                    </Button>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("Invite link")}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate border border-border bg-secondary px-2 py-1 text-xs">
                      {identity.inviteUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void copy(identity.inviteUrl)}
                    >
                      <Copy />
                      {t("Copy")}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-center">
                {/* 服务端直接出 SVG：客户端零依赖、零 JS，内容也只在服务端可信 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/api/distribution/my/qrcode"
                  alt={t("Promotion QR code")}
                  width={160}
                  height={160}
                  className="mx-auto h-40 w-40 border border-border bg-card"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("Scan to open my promotion page")}
                </p>
                {/* P1-11 推广海报：服务端出 SVG（矢量、可直接转发/长按保存） */}
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="mt-2.5 h-9 w-full justify-center"
                >
                  <a
                    href="/api/distribution/my/poster?download=1"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ImageDown className="h-4 w-4" />
                    {t("Download poster")}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-3 text-sm font-medium">{t("Team overview")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t("Direct customers")} value={identity.directCount} />
              <StatCard label={t("Team size")} value={identity.teamCount} />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium">{t("Promotion tools")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link key={entry.href} href={entry.href} className="group">
                    <Card className="panel h-full transition-colors group-hover:bg-muted/50">
                      <CardContent className="flex items-start gap-3 p-4">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{entry.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

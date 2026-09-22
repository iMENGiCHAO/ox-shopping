"use client";

import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { BadgeCheck, Clock, Coins, Share2, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";
import { cny } from "@/components/shop/distribution/format";

/**
 * 分销规则说明（大爷 2026-09-20 要求：「分销商都不知道游戏规则，页面里要有详细说明」）。
 *
 * 三条原则：
 *   1. **数字来自服务端实际配置**（`/api/distribution/my/rules`），不是写死的文档 ——
 *      后台改了层级比例/持有期/提现门槛，这里刷新即同步，杜绝"说明与结算不一致"；
 *   2. **只讲分销商该知道的**：不给风控内部阈值、不列分类/商品级规则明细（防规则套利）；
 *   3. 复用分销中心的现代圆角面板样式（`panel`），与其它页观感一致。
 */

interface RulesResponse {
  config: {
    bindTrigger: "register" | "first_order";
    allowRebind: boolean;
    bindExpireDays: number;
    maxCommissionLevels: number;
    maxTotalRatio: number;
    selfPurchaseCommission: boolean;
    selfPurchaseCountForUpstream: boolean;
    settleHoldDays: number;
    minWithdrawAmount: number;
  };
  levels: {
    level: number;
    mode: "RATIO" | "FIXED";
    ratio: number;
    fixedAmount: number | null;
    effectiveAt: string | null;
    expireAt: string | null;
  }[];
  hasScopedRules: boolean;
  hasTierRules: boolean;
}

export default function DistributionRulesPage() {
  const t = useT();
  const [data, setData] = useState<RulesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<RulesResponse>("/api/distribution/my/rules"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const c = data.config;
  // 防御性去重：服务端已保证每级一条，但多实例/历史数据下重复行会让 React key 撞车、
  // 也会让"合计比例"算重 —— 客户端按 level 取第一条（服务端按 updatedAt 倒序，即最新生效的那条）
  const levels = [...new Map(data.levels.map((l) => [l.level, l])).values()].sort(
    (a, b) => a.level - b.level,
  );
  const totalRatio = levels
    .filter((l) => l.level <= c.maxCommissionLevels && l.mode === "RATIO")
    .reduce((s, l) => s + l.ratio, 0);

  return (
    <div className="space-y-6">
      {/* 一句话总览 */}
      <section className="panel border border-border bg-gradient-to-br from-secondary/60 via-card to-card p-5 shadow-card">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            <BadgeCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">{t("How you earn")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {t(
                "Share your link. When someone signs up or places an order through it, that customer is linked to you permanently — and you earn commission on their real, paid orders.",
              )}
            </p>
          </div>
        </div>
      </section>

      {/* 1. 归属规则 */}
      <RuleSection icon={Share2} title={t("1. Who counts as your customer")}>
        <RuleItem label={t("Binding moment")}>
          {c.bindTrigger === "register"
            ? t("Whenever someone registers through your link, they are linked to you.")
            : t("The link is only recorded at first order — a registration alone does not bind.")}
        </RuleItem>
        <RuleItem label={t("Repeat purchases")}>
          {t(
            "Every later order counts for you automatically, even if the customer orders without your link.",
          )}
        </RuleItem>
        <RuleItem label={t("Not transferable")}>
          {c.allowRebind
            ? t(
                "The platform has enabled re-binding: a customer can be moved to another distributor under review.",
              )
            : t(
                "Once bound, no other distributor can take the customer away — first bind wins permanently.",
              )}
        </RuleItem>
        <RuleItem label={t("Organic customers")}>
          {t(
            "Customers who arrive without any referral link belong to nobody and generate no commission.",
          )}
        </RuleItem>
        <RuleItem label={t("Attribution window")}>
          {c.bindExpireDays > 0
            ? t("A referral link identifies the referrer for {days} days after it is clicked.", {
                days: c.bindExpireDays,
              })
            : t("A referral link never expires until the customer is bound.")}
        </RuleItem>
      </RuleSection>

      {/* 2. 佣金规则 */}
      <RuleSection icon={Coins} title={t("2. How commission is calculated")}>
        <RuleItem label={t("Commission base")}>
          {t(
            "The goods actually paid on an order (subtotal minus discounts). Shipping and tax are never included.",
          )}
        </RuleItem>
        <RuleItem label={t("Levels")}>
          {t(
            "Commission is paid up the chain. Only the first {levels} levels are paid; higher levels are still recorded but earn nothing.",
            { levels: c.maxCommissionLevels },
          )}
        </RuleItem>
        <div className="panel mt-2 overflow-hidden border border-border">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead>{t("Level")}</TableHead>
                <TableHead className="w-32 text-right">{t("Rate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.filter((l) => l.level <= c.maxCommissionLevels).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-sm text-muted-foreground">
                    {t("No commission rules are configured yet — please contact support.")}
                  </TableCell>
                </TableRow>
              ) : (
                levels
                  .filter((l) => l.level <= c.maxCommissionLevels)
                  .map((l) => (
                    <TableRow key={l.level}>
                      <TableCell className="text-sm">
                        {t("Level {n}", { n: l.level })}
                        {l.level === 1 ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            （{t("your direct customer")}）
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {l.mode === "FIXED" ? (
                          <>
                            {t("Fixed amount per order")}: {cny(l.fixedAmount ?? 0)}
                          </>
                        ) : (
                          `${l.ratio}%`
                        )}
                        {l.effectiveAt || l.expireAt ? (
                          <span className="ml-2 block text-xs font-normal text-muted-foreground">
                            {l.effectiveAt
                              ? `${new Date(l.effectiveAt).toLocaleDateString()} `
                              : ""}
                            {l.expireAt ? `→ ${new Date(l.expireAt).toLocaleDateString()}` : ""}
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
        <RuleItem label={t("Total cap")}>
          {t(
            "All levels combined never exceed {cap}% of an order — the platform configures this to stay within gross margin.",
            { cap: c.maxTotalRatio },
          )}
          {totalRatio > 0 ? (
            <span className="ml-1 text-muted-foreground">
              （{t("currently configured total")}: {totalRatio.toFixed(2)}%）
            </span>
          ) : null}
        </RuleItem>
        {data.hasScopedRules ? (
          <RuleItem label={t("Product rules")}>
            {t(
              "Some categories or products have their own rates; those override the global rates above.",
            )}
          </RuleItem>
        ) : null}
        {data.hasTierRules ? (
          <RuleItem label={t("Distributor tiers")}>
            {t(
              "Some rates depend on your distributor tier: a tier-specific rule replaces the general rate for that level. Your tier is shown in the distribution center.",
            )}
          </RuleItem>
        ) : null}
        <RuleItem label={t("Your own orders")}>
          {c.selfPurchaseCommission
            ? t("Your own purchases can also earn commission.")
            : t("You do not earn level-1 commission on your own purchases.")}{" "}
          {c.selfPurchaseCountForUpstream
            ? t("Your upline still earns on your purchases.")
            : t("Your upline does not earn on your purchases either.")}
        </RuleItem>
      </RuleSection>

      {/* 3. 结算 */}
      <RuleSection icon={Clock} title={t("3. When commission becomes withdrawable")}>
        <RuleItem label={t("Paid order")}>
          {t("As soon as an order is paid, the commission is recorded as pending.")}
        </RuleItem>
        <RuleItem label={t("Settled")}>
          {t(
            "Once the buyer confirms delivery — or {days} days after payment — the commission becomes withdrawable.",
            { days: c.settleHoldDays },
          )}
        </RuleItem>
        <RuleItem label={t("Refunds")}>
          {t(
            "If the order is refunded or cancelled, the commission is reversed. Amounts already withdrawable are deducted back from your balance.",
          )}
        </RuleItem>
      </RuleSection>

      {/* 4. 提现 */}
      <RuleSection icon={Wallet} title={t("4. Withdrawals")}>
        <RuleItem label={t("Minimum")}>
          {t("The minimum withdrawal is {amount}.", { amount: cny(c.minWithdrawAmount) })}
        </RuleItem>
        <RuleItem label={t("Process")}>
          {t(
            "Submit a request → the platform reviews it → the payout is made offline and marked as paid.",
          )}
        </RuleItem>
        <RuleItem label={t("One at a time")}>
          {t("Only one withdrawal request can be in progress at a time.")}
        </RuleItem>
      </RuleSection>

      {/* 5. 合规 */}
      <RuleSection icon={ShieldCheck} title={t("5. Fair play")}>
        <RuleItem label={t("Real orders only")}>
          {t(
            "Commission is only ever generated by real paid orders. There is no bonus for recruiting people, and never any fee to join.",
          )}
        </RuleItem>
        <RuleItem label={t("No self-dealing")}>
          {t(
            "Faking orders, buying through your own link to farm commission, or bulk-registering accounts will have commission cancelled and the account banned.",
          )}
        </RuleItem>
        <RuleItem label={t("Data privacy")}>
          {t(
            "You see your own team's orders only, with phone numbers and addresses masked. Full data is available to the platform alone.",
          )}
        </RuleItem>
      </RuleSection>
    </div>
  );
}

function RuleSection({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel border border-border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        {title}
      </h2>
      <div className="mt-3 space-y-2.5 text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

function RuleItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 pb-2.5 last:border-0 last:pb-0 md:flex-row md:gap-3">
      <span className="shrink-0 text-muted-foreground md:w-40">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

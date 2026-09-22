"use client";

import * as React from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";
import { cny } from "@/components/shop/distribution/format";
import type { DistributionAccountSummary, DistributionIdentity } from "@/lib/distribution/contract";

/**
 * 「分享链接赚佣金」小卡片（大爷 2026-09-20 亲自定的形态与样式）。
 *
 * 形态：不要在原站左侧加「我的推广」主入口（污染主站、太杂乱），只要**一张分享小卡片**，
 * 参考模型公司「分享送额度」那种；等分享出去的链接真有人下单了，卡片里才出现「分销中心」入口。
 *
 * 样式：大爷第二轮反馈「都是线条和框框，太简单粗糙，要有流行的圆角」——
 * 因此这里用现代面板语言：16px 圆角 + 柔和分层阴影 + 浅灰图标胶囊 + 圆角链接框，
 * 并给整卡铺一层极淡的渐变底，避免"白底细线框"的呆板感。
 * 外层容器（账户页/分销中心）已带 `data-modern-cards` / `data-dist-center` 作用域，
 * 圆角与阴影在这一区域内是一致的现代口径。
 *
 * 两个刻意的行为：
 *   1. `DISTRIBUTION_ENABLED=false` 时接口 404 → 整块**静默隐藏**，页面不留痕迹；
 *   2. 数据没回来之前不渲染占位块 —— 卡片很小，宁可晚一拍出现，也不要闪一块空白。
 */
export function DistributionShareCard() {
  const t = useT();
  const [identity, setIdentity] = React.useState<DistributionIdentity | null>(null);
  const [account, setAccount] = React.useState<DistributionAccountSummary | null>(null);
  const [hidden, setHidden] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await apiFetch<{ identity: DistributionIdentity }>(
          "/api/distribution/my/links",
        );
        if (!alive) return;
        setIdentity(res.identity);
        if (res.identity.isDistributor) {
          const acc = await apiFetch<{ account: DistributionAccountSummary }>(
            "/api/distribution/my/account",
          ).catch(() => null);
          if (alive && acc) setAccount(acc.account);
        }
      } catch {
        // 未启用 / 未登录 / 网络失败：静默隐藏，绝不把错误抛给商城页面
        if (alive) setHidden(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const copy = async () => {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.inviteUrl);
      setCopied(true);
      toast.success(t("Link copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("Copy failed, please copy manually"));
    }
  };

  if (hidden || !identity) return null;

  return (
    <div className="panel border border-border bg-gradient-to-br from-secondary/50 via-card to-card p-5 shadow-card">
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <Share2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight">
            {t("Share your link, earn commission")}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t(
              "Anyone who registers or places an order through your link is linked to you — repeat purchases count too.",
            )}
          </p>
        </div>
      </div>

      {/* 链接行：圆角输入框样式 + 主按钮，一行放得下就一行 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-input bg-card px-3.5 py-2.5 text-[12px] text-muted-foreground shadow-sm">
          {identity.inviteUrl}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-md px-4"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t("Copy link")}
        </Button>
      </div>

      {identity.isDistributor ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[12px] text-muted-foreground">
            {t("You are a distributor now — your commission is accruing.")}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {account ? (
              <span className="text-[12px] text-muted-foreground">
                {t("Available balance")}{" "}
                <span className="font-semibold text-foreground">{cny(account.balance)}</span>
                <span className="mx-2 opacity-40">·</span>
                {t("Pending commission")}{" "}
                <span className="font-semibold text-foreground">
                  {cny(account.pendingCommission)}
                </span>
              </span>
            ) : null}
            {/* 新标签页打开独立页面：不打断购物，也不把分销后台混进商城 */}
            <Button asChild size="sm" className="h-10 rounded-md px-4">
              <a href="/distribution" target="_blank" rel="noopener noreferrer">
                {t("Open distribution center")}
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

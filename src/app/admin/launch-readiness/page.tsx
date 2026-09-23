import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getLaunchReadiness,
  type ReadinessStatus,
} from "@/server/services/launch-readiness.service";

export const dynamic = "force-dynamic";

/** 展示顺序：阻塞 → 警告 → 就绪（先看最要紧的） */
const STATUS_ORDER: Record<ReadinessStatus, number> = { blocked: 0, warn: 1, ready: 2 };

const STATUS_META: Record<
  ReadinessStatus,
  { label: string; icon: typeof CheckCircle2; tone: string; badge: string }
> = {
  blocked: {
    label: "阻塞",
    icon: ShieldAlert,
    tone: "text-destructive",
    badge: "bg-destructive/10 text-destructive",
  },
  warn: {
    label: "警告",
    icon: AlertTriangle,
    tone: "text-warning",
    badge: "bg-warning/10 text-warning",
  },
  ready: {
    label: "就绪",
    icon: CheckCircle2,
    tone: "text-success",
    badge: "bg-success/10 text-success",
  },
};

/**
 * 后台：上线自检。
 *
 * 把「能否开门做生意」的条件集中成可核对清单：收款能力、邮件通道、站点地址、
 * 密钥守卫、存储、限流后端、管理员密码。每一项都是**真实检测**的结果
 * （见 launch-readiness.service.ts），不是写死的清单项。
 */
export default async function LaunchReadinessPage() {
  const { items, counts, readyToLaunch } = await getLaunchReadiness();
  const ordered = [...items].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="上线自检"
        description="上线前逐项核对：能否收到钱、能否发出邮件、配置是否指向真实环境。检测结果实时读取当前配置与数据库。"
      />

      {/* 结论 */}
      <Card className={cn(readyToLaunch ? "border-success/40" : "border-destructive/40")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {readyToLaunch ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            )}
            {readyToLaunch
              ? "无阻塞项，具备上线条件"
              : `有 ${counts.blocked} 项阻塞，暂不具备收款条件`}
          </CardTitle>
          <CardDescription>
            {readyToLaunch
              ? "警告项按业务情况判断即可（例如单实例部署不启用 Redis 是可接受的）。"
              : "阻塞项会直接影响真实交易或账号安全，请先处理完再看警告项。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
            <span className="text-muted-foreground">阻塞</span>
            <span className="font-medium tabular-nums text-destructive">{counts.blocked}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
            <span className="text-muted-foreground">警告</span>
            <span className="font-medium tabular-nums text-warning">{counts.warn}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2">
            <span className="text-muted-foreground">就绪</span>
            <span className="font-medium tabular-nums text-success">{counts.ready}</span>
          </div>
        </CardContent>
      </Card>

      {/* 逐项 */}
      <div className="space-y-3">
        {ordered.map((item) => {
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          return (
            <Card key={item.key}>
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.tone)} />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", meta.badge)}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[13px] text-muted-foreground">{item.detail}</p>
                    {item.action ? (
                      <p className="text-[13px] text-foreground/80">→ {item.action}</p>
                    ) : null}
                  </div>
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-secondary"
                  >
                    去处理
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

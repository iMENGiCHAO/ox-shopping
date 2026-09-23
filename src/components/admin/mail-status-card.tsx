"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface MailChannelCheck {
  key: string;
  label: string;
  configured: boolean;
  required: boolean;
}

interface MailStatus {
  provider: string;
  effective: string;
  from: string;
  deliverable: boolean;
  checks: MailChannelCheck[];
  warning?: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  resend: "Resend",
  smtp: "SMTP",
  console: "未配置（仅写日志）",
};

/**
 * 邮件服务状态卡片（系统设置页）。
 *
 * 解决的真实问题：`sendMail` 在通道配置不全时**静默降级**到 console ——
 * 只打日志 + 落盘 .mail-out。运营完全无感知，以为订单邮件、到货提醒都发出去了。
 * 这里把「声明通道 / 实际生效通道 / 缺失配置」显式展示，并提供真实发信自检。
 */
export function MailStatusCard() {
  const [status, setStatus] = React.useState<MailStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [testTo, setTestTo] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ status: MailStatus }>("/api/admin/mail-status");
      setStatus(res.status);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载邮件服务状态失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const sendTest = async () => {
    const to = testTo.trim();
    if (!to) {
      toast.error("请先填写接收测试邮件的邮箱地址");
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch<{ channel: string }>("/api/admin/mail-test", {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      toast.success(
        `测试邮件已通过 ${CHANNEL_LABELS[res.channel] ?? res.channel} 发出，请到 ${to} 查收`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "测试邮件发送失败");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-muted-foreground" />
          邮件服务
        </CardTitle>
        <CardDescription>
          订单确认、发货通知、到货提醒、找回密码等邮件都依赖此通道。配置不全时邮件只会写入日志，不会真正送达顾客。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !status ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">状态加载失败</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        ) : (
          <>
            {/* 通道状态 */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2 text-sm">
                <span className="text-muted-foreground">生效通道</span>
                <span className="flex items-center gap-1.5 font-medium">
                  {status.deliverable ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                  {CHANNEL_LABELS[status.effective] ?? status.effective}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2 text-sm">
                <span className="text-muted-foreground">声明通道</span>
                <span className="font-medium">
                  {CHANNEL_LABELS[status.provider] ?? status.provider}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-4 py-2 text-sm sm:col-span-2">
                <span className="text-muted-foreground">发件地址</span>
                <code className="truncate text-xs">{status.from}</code>
              </div>
            </div>

            {/* 配置不完整告警：说清后果 */}
            {status.warning ? (
              <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-foreground/80">{status.warning}</p>
              </div>
            ) : null}

            {/* 通道配置清单（只显示是否已配置，不显示密钥内容） */}
            {status.checks.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">通道配置（.env）</p>
                <ul className="divide-y divide-border rounded-md border">
                  {status.checks.map((c) => (
                    <li key={c.key} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span>
                        {c.label}
                        <code className="ml-2 text-[11px] text-muted-foreground">{c.key}</code>
                        {!c.required ? (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">（可选）</span>
                        ) : null}
                      </span>
                      {c.configured ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          已配置
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="h-3.5 w-3.5" />
                          未配置
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 连通性自检：真实发信，失败回显服务商原因 */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                连通性自检 —— 真实发送一封测试邮件，失败会显示服务商返回的原因
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="接收测试邮件的邮箱地址"
                  className="sm:flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void sendTest();
                    }
                  }}
                />
                <Button onClick={() => void sendTest()} disabled={sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {sending ? "发送中…" : "发送测试邮件"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

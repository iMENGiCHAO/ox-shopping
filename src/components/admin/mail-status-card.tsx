"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/admin/lang-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  source: "db" | "env";
  deliverable: boolean;
  checks: MailChannelCheck[];
  warning?: string;
}

interface MailConfig {
  provider: "console" | "smtp" | "resend";
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasSmtpPass: boolean;
  hasResendApiKey: boolean;
  source: "db" | "env";
}

interface FormState {
  provider: "console" | "smtp" | "resend";
  from: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  /** 空串 = 保留原值（接口只识别「填了才改」） */
  smtpPass: string;
  resendApiKey: string;
}

const CHANNELS: { value: FormState["provider"]; label: string }[] = [
  { value: "smtp", label: "SMTP（自建/企业邮箱）" },
  { value: "resend", label: "Resend（API 服务）" },
  { value: "console", label: "仅写日志（开发/演示）" },
];

function toForm(config: MailConfig): FormState {
  return {
    provider: config.provider,
    from: config.from,
    smtpHost: config.smtpHost,
    smtpPort: String(config.smtpPort ?? 587),
    smtpSecure: config.smtpSecure,
    smtpUser: config.smtpUser,
    smtpPass: "",
    resendApiKey: "",
  };
}

/**
 * 邮件服务卡片（系统设置页）：**状态 + 配置 + 连通性自检**三合一。
 *
 * 此前这里只有只读状态 —— 通道写死在 `.env`（`MAIL_PROVIDER`），运营改一次
 * 邮件服务商要动部署配置重启服务，卡片上的「发送测试邮件」在未配置时也只能落盘。
 * 现在配置落库、密钥加密、后台直接改，保存后立即生效（无需重启）。
 */
export function MailStatusCard() {
  const t = useT();
  const [config, setConfig] = React.useState<MailConfig | null>(null);
  const [status, setStatus] = React.useState<MailStatus | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ config: MailConfig; status: MailStatus }>(
        "/api/admin/mail-config",
      );
      setConfig(res.config);
      setStatus(res.status);
      setForm(toForm(res.config));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("加载邮件配置失败"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ config: MailConfig; status: MailStatus }>(
        "/api/admin/mail-config",
        {
          method: "PUT",
          body: JSON.stringify({
            provider: form.provider,
            from: form.from,
            smtpHost: form.smtpHost,
            smtpPort: Number(form.smtpPort) || 587,
            smtpSecure: form.smtpSecure,
            smtpUser: form.smtpUser,
            // 空串不提交：接口以「填了才改」处理密钥，避免误清空
            ...(form.smtpPass ? { smtpPass: form.smtpPass } : {}),
            ...(form.resendApiKey ? { resendApiKey: form.resendApiKey } : {}),
          }),
        },
      );
      setConfig(res.config);
      setStatus(res.status);
      setForm(toForm(res.config));
      toast.success(t("邮件配置已保存（立即生效）"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("保存邮件配置失败"));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    const to = testTo.trim();
    if (!to) {
      toast.error(t("请先填写接收测试邮件的邮箱地址"));
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch<{ channel: string }>("/api/admin/mail-test", {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      toast.success(t("测试邮件已发出，请查收") + `（${res.channel} → ${to}）`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("测试邮件发送失败"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-muted-foreground" />
          {t("邮件服务")}
        </CardTitle>
        <CardDescription>
          {t(
            "订单确认、发货通知、到货提醒、找回密码等邮件都依赖此通道。配置不全时邮件只会写入日志，不会真正送达顾客。",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !config || !status || !form ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t("状态加载失败")}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t("重试")}
            </Button>
          </div>
        ) : (
          <>
            {/* ── 当前状态 ── */}
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{t("生效通道")}</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {status.deliverable ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    )}
                    {status.effective === "console"
                      ? t("仅写日志")
                      : (status.effective ?? "").toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{t("配置来源")}</span>
                  <span className="font-medium">
                    {status.source === "db" ? t("后台配置") : t("环境变量兜底")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-4 py-2 text-sm sm:col-span-2">
                  <span className="text-muted-foreground">{t("发件地址")}</span>
                  <code className="truncate text-xs">{status.from}</code>
                </div>
              </div>

              {status.warning ? (
                <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-foreground/80">{status.warning}</p>
                </div>
              ) : null}

              {status.checks.length > 0 ? (
                <ul className="divide-y divide-border rounded-md border">
                  {status.checks.map((c) => (
                    <li key={c.key} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span>
                        {c.label}
                        {!c.required ? (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            （{t("可选")}）
                          </span>
                        ) : null}
                      </span>
                      {c.configured ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t("已配置")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <XCircle className="h-3.5 w-3.5" />
                          {t("未配置")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* ── 通道配置（后台可改，密钥加密落库）── */}
            <div className="space-y-3 border-t pt-5">
              <div>
                <p className="text-sm font-medium">{t("通道配置")}</p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "密钥加密存储，接口只回显「是否已配置」；留空表示不修改。保存后立即生效，无需重启。",
                  )}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mail-provider">{t("发送通道")}</Label>
                  <Select
                    value={form.provider}
                    onValueChange={(v) => patch({ provider: v as FormState["provider"] })}
                  >
                    <SelectTrigger id="mail-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {t(c.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mail-from">{t("发件人")}</Label>
                  <Input
                    id="mail-from"
                    value={form.from}
                    onChange={(e) => patch({ from: e.target.value })}
                    placeholder={status.from || "Brand <no-reply@example.com>"}
                  />
                </div>

                {form.provider === "smtp" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-host">{t("SMTP 主机")}</Label>
                      <Input
                        id="smtp-host"
                        value={form.smtpHost}
                        onChange={(e) => patch({ smtpHost: e.target.value })}
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-port">{t("端口")}</Label>
                      <Input
                        id="smtp-port"
                        value={form.smtpPort}
                        onChange={(e) => patch({ smtpPort: e.target.value })}
                        placeholder="587"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-user">{t("用户名")}</Label>
                      <Input
                        id="smtp-user"
                        value={form.smtpUser}
                        onChange={(e) => patch({ smtpUser: e.target.value })}
                        placeholder="no-reply@example.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-pass">{t("密码 / 授权码")}</Label>
                      <Input
                        id="smtp-pass"
                        type="password"
                        value={form.smtpPass}
                        onChange={(e) => patch({ smtpPass: e.target.value })}
                        placeholder={config.hasSmtpPass ? t("已配置，留空不修改") : t("未配置")}
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        id="smtp-secure"
                        type="checkbox"
                        className="h-4 w-4 accent-foreground"
                        checked={form.smtpSecure}
                        onChange={(e) => patch({ smtpSecure: e.target.checked })}
                      />
                      <Label htmlFor="smtp-secure" className="text-sm font-normal">
                        {t("使用 SSL/TLS（465 端口通常勾选；587 用 STARTTLS 不勾选）")}
                      </Label>
                    </div>
                  </>
                ) : null}

                {form.provider === "resend" ? (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="resend-key">Resend API Key</Label>
                    <Input
                      id="resend-key"
                      type="password"
                      value={form.resendApiKey}
                      onChange={(e) => patch({ resendApiKey: e.target.value })}
                      placeholder={config.hasResendApiKey ? t("已配置，留空不修改") : "re_..."}
                    />
                  </div>
                ) : null}

                {form.provider === "console" ? (
                  <p className="text-[13px] text-muted-foreground sm:col-span-2">
                    {t(
                      "「仅写日志」不会真正发出邮件：内容写入日志与本地 .mail-out 目录，用于开发演示，切勿用于线上。",
                    )}
                  </p>
                ) : null}
              </div>

              <Button onClick={() => void save()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? t("保存中…") : t("保存配置")}
              </Button>
            </div>

            {/* ── 连通性自检 ── */}
            <div className="space-y-2 border-t pt-5">
              <p className="text-sm font-medium">{t("连通性自检")}</p>
              <p className="text-xs text-muted-foreground">
                {t("真实发送一封测试邮件，失败会显示服务商返回的原因。")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder={t("接收测试邮件的邮箱地址")}
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
                  {sending ? t("发送中…") : t("发送测试邮件")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

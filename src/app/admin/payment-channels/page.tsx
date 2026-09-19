"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Pencil, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChannelFieldMeta {
  key: string;
  label: string;
  secret: boolean;
}
interface ChannelMetaDef {
  code: string;
  name: string;
  provider: string;
  description?: string;
  fields: ChannelFieldMeta[];
}
interface ChannelRow {
  id: string;
  code: string;
  name: string;
  provider: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
  configured: boolean;
  /** 配置完整 + 网关真实接入（前台可选）；预留级渠道为 false */
  ready: boolean;
  /** 「密钥已填全但渠道仍不可用」时，逐渠道说明还差哪一步（由 provider.readinessNote 提供） */
  readyNote?: string;
}

/** 长文本字段（PEM 密钥/公钥）用多行输入 */
const MULTILINE_KEYS = new Set(["privateKey", "alipayPublicKey", "merchantPrivateKey"]);

export default function AdminPaymentChannelsPage() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [meta, setMeta] = useState<ChannelMetaDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // 编辑对话框状态
  const [dialog, setDialog] = useState<{
    mode: "create" | "edit";
    provider: string;
    channelId?: string;
    defaultName: string;
    fields: ChannelFieldMeta[];
  } | null>(null);
  const [formName, setFormName] = useState("");
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ channels: ChannelRow[]; meta: ChannelMetaDef[] }>(
        "/api/admin/payment-channels",
      );
      setChannels(Array.isArray(res?.channels) ? res.channels : []);
      setMeta(Array.isArray(res?.meta) ? res.meta : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载支付渠道失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = (m: ChannelMetaDef) => {
    setDialog({ mode: "create", provider: m.provider, defaultName: m.name, fields: m.fields });
    setFormName(m.name);
    const init: Record<string, string | boolean> = {};
    for (const f of m.fields) init[f.key] = f.key === "sandbox" ? false : "";
    setFormValues(init);
  };

  const openEdit = (c: ChannelRow) => {
    const m = meta.find((x) => x.provider === c.provider);
    setDialog({
      mode: "edit",
      provider: c.provider,
      channelId: c.id,
      defaultName: c.name,
      fields: m?.fields ?? [],
    });
    setFormName(c.name);
    const init: Record<string, string | boolean> = {};
    for (const f of m?.fields ?? []) {
      if (f.key === "sandbox") {
        init[f.key] = c.config[f.key] === true || c.config[f.key] === "true";
      } else if (f.secret) {
        // secret 已脱敏：不预填，留空即「保留原值」
        init[f.key] = "";
      } else {
        init[f.key] = typeof c.config[f.key] === "string" ? (c.config[f.key] as string) : "";
      }
    }
    setFormValues(init);
  };

  const setField = (key: string, value: string | boolean) =>
    setFormValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!dialog) return;
    setSaving(true);
    const config: Record<string, unknown> = { ...formValues };
    const payload = {
      code: channels.find((c) => c.id === dialog.channelId)?.code ?? dialog.provider,
      name: formName.trim(),
      provider: dialog.provider,
      sortOrder:
        dialog.mode === "edit"
          ? (channels.find((c) => c.id === dialog.channelId)?.sortOrder ?? 0)
          : channels.length * 10,
      config,
      enabled:
        dialog.mode === "edit"
          ? (channels.find((c) => c.id === dialog.channelId)?.enabled ?? false)
          : false,
    };
    try {
      if (dialog.mode === "edit" && dialog.channelId) {
        await apiFetch(`/api/admin/payment-channels/${dialog.channelId}`, {
          method: "PUT",
          body: JSON.stringify({ ...payload, id: dialog.channelId }),
        });
        toast.success("支付渠道已更新");
      } else {
        await apiFetch("/api/admin/payment-channels", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("支付渠道已创建（默认未启用，请配置后手动启用）");
      }
      setDialog(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: ChannelRow, enabled: boolean) => {
    setTogglingId(c.id);
    try {
      await apiFetch(`/api/admin/payment-channels/${c.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      toast.success(enabled ? "已启用" : "已停用");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新状态失败");
    } finally {
      setTogglingId(null);
    }
  };

  /** 统一状态描述（消灭「未创建/未配置/已停用」三套口径） */
  const statusText = (m: ChannelMetaDef, c?: ChannelRow) => {
    if (!c || !c.configured) return "未配置参数（启用前需先填写）";
    if (!c.enabled) return "已配置，未启用（前台显示「暂未开通」）";
    if (c.ready) return "已启用，前台结算页可选";
    return "已启用（预留：待接入真实网关，前台仍显示「暂未开通」）";
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="支付渠道"
        description="各收款渠道已预留：在下方填入商户参数并启用即可接通。预留渠道接通前，前台结账页显示「暂未开通」置灰，不会影响下单。密钥加密存储，前台不展示。"
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {meta.map((m) => {
                const channel = channels.find((c) => c.code === m.code);
                const configured = !!channel?.configured;
                return (
                  <li key={m.code} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {m.provider === "mock" ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{channel?.name ?? m.name}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {m.code}
                        </code>
                        {configured ? (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success">
                            已配置
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            未配置
                          </span>
                        )}
                        {configured &&
                          (channel?.ready ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-foreground">
                              可收款
                            </span>
                          ) : (
                            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                              预留 · 待接入
                            </span>
                          ))}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {statusText(m, channel)}
                      </p>
                      {channel?.readyNote ? (
                        <p className="mt-1 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
                          {channel.readyNote}
                        </p>
                      ) : null}
                      {m.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground/70">{m.description}</p>
                      ) : null}
                    </div>
                    {channel ? (
                      <>
                        <Switch
                          checked={channel.enabled}
                          disabled={
                            togglingId === channel.id ||
                            !configured /* 未配置不可启用（服务端同样拦截） */
                          }
                          onCheckedChange={(v) => void toggle(channel, v)}
                          aria-label={`切换 ${channel.name} 启用状态`}
                          title={configured ? undefined : "请先完成参数配置，再启用"}
                        />
                        <Button size="sm" variant="outline" onClick={() => openEdit(channel)}>
                          <Pencil className="h-3.5 w-3.5" />
                          编辑
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openCreate(m)}>
                        <Plus className="h-3.5 w-3.5" />
                        创建配置
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 新增 / 编辑对话框 */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!saving && !v) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "编辑支付渠道" : "配置支付渠道"}</DialogTitle>
            <DialogDescription>
              密钥字段加密存储；编辑时留空表示保留原值，不会回显完整密钥。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pc-name">显示名称</Label>
              <Input
                id="pc-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={dialog?.defaultName}
              />
            </div>
            {dialog?.fields.map((f) => {
              const multiline = MULTILINE_KEYS.has(f.key);
              const value = formValues[f.key];
              if (f.key === "sandbox") {
                return (
                  <div
                    key={f.key}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <Label htmlFor={`pc-${f.key}`} className="text-sm font-normal">
                      {f.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        （测试沙箱，申请账号前建议开启）
                      </span>
                    </Label>
                    <Switch
                      id={`pc-${f.key}`}
                      checked={value === true || value === "true"}
                      onCheckedChange={(v) => setField(f.key, v)}
                    />
                  </div>
                );
              }
              return (
                <div key={f.key} className="space-y-2">
                  <Label htmlFor={`pc-${f.key}`}>{f.label}</Label>
                  {multiline ? (
                    <Textarea
                      id={`pc-${f.key}`}
                      rows={4}
                      className="font-mono text-xs"
                      placeholder={f.secret ? "已保存（留空不修改，重新填写则覆盖）" : ""}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  ) : (
                    <Input
                      id={`pc-${f.key}`}
                      type={f.secret ? "password" : "text"}
                      autoComplete="off"
                      placeholder={f.secret ? "已保存（留空不修改，重新填写则覆盖）" : ""}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import * as React from "react";
import { CreditCard, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/admin/lang-provider";
import { cn } from "@/lib/utils";

interface FieldDef {
  key: string;
  label: string;
  secret: boolean;
}
interface GatewayDef {
  key: string;
  name: string;
  fields: FieldDef[];
}
interface GatewayConfig {
  enabled: boolean;
  [k: string]: string | boolean;
}

/** 支付接口(预留)— 网关凭证统一配置;当前结算走 Mock,接入后即可切换真实收款 */
export default function AdminPaymentsPage() {
  const t = useT();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [gateways, setGateways] = React.useState<GatewayDef[]>([]);
  const [config, setConfig] = React.useState<Record<string, GatewayConfig>>({});

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ gateways: GatewayDef[]; config: Record<string, GatewayConfig> }>(
          "/api/admin/payment-settings",
        );
        setGateways(res.gateways);
        setConfig(res.config);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("Failed to load"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{ config: Record<string, GatewayConfig> }>("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      setConfig(res.config);
      toast.success(t("Payment settings saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("Payment gateways")}
        description={t("Reserve payment integrations — fill in credentials to go live later")}
      />

      {/* 预留说明 */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-8 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("Checkout currently runs on Mock payment")}</p>
            <p className="mt-1">
              {t(
                "Fill in a gateway's credentials and enable it — the reserved provider hooks are wired to this configuration. Secret fields are masked after saving; leave them blank to keep existing values.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {gateways.map((g) => {
            const cfg = config[g.key] ?? { enabled: false };
            const setField = (key: string, value: string | boolean) =>
              setConfig((c) => ({
                ...c,
                [g.key]: { ...(c[g.key] ?? { enabled: false }), [key]: value },
              }));
            return (
              <Card key={g.key} className={cn(cfg.enabled && "border-primary/50")}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">{g.name}</p>
                    </div>
                    <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={cfg.enabled === true}
                        onChange={(e) => setField("enabled", e.target.checked)}
                        className="h-4 w-4 accent-[#1C1C1C]"
                      />
                      {t("Enabled")}
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.fields.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <Label htmlFor={`pay-${g.key}-${f.key}`} className="text-xs text-muted-foreground">
                          {f.label}
                          {f.secret ? ` · ${t("secret")}` : ""}
                        </Label>
                        <Input
                          id={`pay-${g.key}-${f.key}`}
                          autoComplete="off"
                          value={String(cfg[f.key] ?? "")}
                          onChange={(e) => setField(f.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t("Save payment settings")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/admin/lang-provider";

interface CurrencyDef {
  code: string;
  name: string;
  country: string;
  symbol: string;
  /** ISO 3166-1 alpha-2（小写）—— 旗帜图取 `public/flags/<flagCode>.svg`（4:3） */
  flagCode: string;
}

interface Snapshot {
  rates: Record<string, number>;
  at: number;
  source: "live" | "db" | "static";
}

/** 后台「货币与汇率」管理卡:快照查看 / 立即刷新 / 手动覆写(1 USD = X) */
export function CurrencyManager() {
  const t = useT();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [currencies, setCurrencies] = React.useState<CurrencyDef[]>([]);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  /** 输入框草稿:code → 字符串("" = 跟随自动) */
  const [draft, setDraft] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch<{
        snapshot: Snapshot;
        currencies: CurrencyDef[];
        overrides: Record<string, number>;
      }>("/api/admin/currency");
      setSnapshot(res.snapshot);
      setCurrencies(res.currencies);
      setDraft(
        Object.fromEntries(
          res.currencies.map((c) => [
            c.code,
            res.overrides[c.code] != null ? String(res.overrides[c.code]) : "",
          ]),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await apiFetch<{ snapshot: Snapshot }>("/api/admin/currency/refresh", {
        method: "POST",
      });
      setSnapshot(res.snapshot);
      // 刷新后重新拉取(合并覆写显示)
      await load();
      toast.success(t("Rates updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to refresh"));
    } finally {
      setRefreshing(false);
    }
  };

  const saveOverrides = async () => {
    setSaving(true);
    try {
      const overrides: Record<string, number | null> = {};
      for (const c of currencies) {
        const raw = (draft[c.code] ?? "").trim();
        overrides[c.code] = raw === "" ? null : Number(raw);
      }
      const res = await apiFetch<{ snapshot: Snapshot }>("/api/admin/currency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      setSnapshot(res.snapshot);
      await load();
      toast.success(t("Overrides saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel =
    snapshot?.source === "live"
      ? t("Live rates")
      : snapshot?.source === "db"
        ? t("Last known rates")
        : t("Built-in reference rates");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("Base currency")}: <span className="font-medium text-foreground">USD $1</span>
            {snapshot ? (
              <>
                {" · "}
                {sourceLabel}
                {" · "}
                {t("Updated")}
                {": "}
                {new Date(snapshot.at).toLocaleString("zh-CN", { hour12: false })}
              </>
            ) : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {t("Refresh rates")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">{t("Currency")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Current rate")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Override rate (1 USD =)")}</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.code} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  {/* 旗帜用图片（与前台同一套资源）：emoji 在 Windows 上不渲染 */}
                  <img
                    src={`/flags/${c.flagCode}.svg`}
                    alt=""
                    aria-hidden="true"
                    width={16}
                    height={12}
                    className="mr-2 inline-block h-3 w-4 align-[-1px]"
                  />
                  <span className="font-medium">{c.code}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.country} ({c.symbol})
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {snapshot?.rates?.[c.code]?.toFixed(4) ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Input
                    inputMode="decimal"
                    placeholder={String(snapshot?.rates?.[c.code]?.toFixed(4) ?? "")}
                    value={draft[c.code] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [c.code]: e.target.value.replace(/[^0-9.]/g, ""),
                      }))
                    }
                    className="ml-auto h-8 w-28 text-right tabular-nums"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void saveOverrides()} disabled={saving || loading}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("Save overrides")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "Leave blank to follow automatic rates. Manual overrides apply store-wide immediately and survive restarts.",
        )}
      </p>
    </div>
  );
}

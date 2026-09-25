"use client";

import * as React from "react";
import { Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/admin/lang-provider";

interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  country: string;
  symbol: string;
  locale: string;
  flagCode: string;
  enabled: boolean;
  payable: boolean;
  sortOrder: number;
}

interface Snapshot {
  rates: Record<string, number>;
  at: number;
  source: "live" | "db" | "static";
}

/**
 * 后台「货币与汇率」管理卡。
 * 三个能力（2026-09-24 扩展）：
 *   1. 币种增删 —— 站点支持哪些币种由运营决定（新增如 THB，删除不需要的）
 *   2. 两级开关 —— enabled=前台展示；payable=允许以该币种下单结算
 *      （展示与结算解耦：可展示 CNY 换算但只收 USD）
 *   3. 汇率管理 —— 快照查看 / 立即刷新 / 手动覆写（1 USD = X）
 */
export function CurrencyManager() {
  const t = useT();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [busyCode, setBusyCode] = React.useState<string | null>(null);
  const [currencies, setCurrencies] = React.useState<CurrencyRow[]>([]);
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  /** 覆写汇率草稿：code → 字符串（"" = 跟随自动） */
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  /** 新增币种表单 */
  const [adding, setAdding] = React.useState(false);
  const [newForm, setNewForm] = React.useState({
    code: "",
    name: "",
    country: "",
    symbol: "",
    locale: "en-US",
    flagCode: "",
  });

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch<{
        snapshot: Snapshot;
        currencies: CurrencyRow[];
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

  /** 开关切换（enabled / payable）——逐行即时保存 */
  const toggleFlag = async (row: CurrencyRow, field: "enabled" | "payable") => {
    setBusyCode(row.code);
    try {
      await apiFetch("/api/admin/currency/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, [field]: !row[field] }),
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusyCode(null);
    }
  };

  const removeCurrency = async (code: string) => {
    if (!window.confirm(`确定删除币种 ${code}？前台选择器将立即移除该币种。`)) return;
    setBusyCode(code);
    try {
      await apiFetch(`/api/admin/currency/config?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      toast.success(`币种 ${code} 已删除`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusyCode(null);
    }
  };

  const addCurrency = async () => {
    const code = newForm.code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      toast.error("币种代码必须是 3 位大写字母（ISO 4217）");
      return;
    }
    if (!newForm.flagCode.trim()) {
      toast.error("请填写国旗代码（ISO 3166 两字母，如 th）");
      return;
    }
    try {
      await apiFetch("/api/admin/currency/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: newForm.name.trim() || code,
          country: newForm.country.trim() || "—",
          symbol: newForm.symbol.trim() || code,
          locale: newForm.locale.trim() || "en-US",
          flagCode: newForm.flagCode.trim().toLowerCase(),
        }),
      });
      toast.success(`币种 ${code} 已添加`);
      setAdding(false);
      setNewForm({ code: "", name: "", country: "", symbol: "", locale: "en-US", flagCode: "" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "添加失败");
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" />
            新增币种
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t("Refresh rates")}
          </Button>
        </div>
      </div>

      {adding ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="cur-code">代码 *</Label>
              <Input
                id="cur-code"
                placeholder="THB"
                maxLength={3}
                value={newForm.code}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cur-name">名称</Label>
              <Input
                id="cur-name"
                placeholder="Thai Baht"
                value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cur-country">国家/地区</Label>
              <Input
                id="cur-country"
                placeholder="Thailand"
                value={newForm.country}
                onChange={(e) => setNewForm((f) => ({ ...f, country: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cur-symbol">符号</Label>
              <Input
                id="cur-symbol"
                placeholder="฿"
                value={newForm.symbol}
                onChange={(e) => setNewForm((f) => ({ ...f, symbol: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cur-locale">Locale</Label>
              <Input
                id="cur-locale"
                placeholder="th-TH"
                value={newForm.locale}
                onChange={(e) => setNewForm((f) => ({ ...f, locale: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cur-flag">国旗代码 *</Label>
              <Input
                id="cur-flag"
                placeholder="th"
                maxLength={2}
                value={newForm.flagCode}
                onChange={(e) =>
                  setNewForm((f) => ({ ...f, flagCode: e.target.value.toLowerCase() }))
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            国旗图取 {"public/flags/<代码>.svg"} —— 新币种请先放置同名 SVG
            （缺失时前台该行不显示国旗但不影响功能）。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void addCurrency()}>
              添加
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">{t("Currency")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Current rate")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("Override rate (1 USD =)")}</th>
              <th className="px-3 py-2 text-center font-medium">前台展示</th>
              <th className="px-3 py-2 text-center font-medium">允许支付</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.code} className={busyCode === c.code ? "opacity-60" : undefined}>
                <td className="border-b px-3 py-2 last:border-b-0">
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
                <td className="border-b px-3 py-2 text-right tabular-nums last:border-b-0">
                  {snapshot?.rates?.[c.code]?.toFixed(4) ?? "—"}
                </td>
                <td className="border-b px-3 py-2 last:border-b-0">
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
                    aria-label={`${c.code} 覆写汇率`}
                  />
                </td>
                <td className="border-b px-3 py-2 text-center last:border-b-0">
                  <Switch
                    checked={c.enabled}
                    onCheckedChange={() => void toggleFlag(c, "enabled")}
                    aria-label={`${c.code} 前台展示开关`}
                  />
                </td>
                <td className="border-b px-3 py-2 text-center last:border-b-0">
                  <Switch
                    checked={c.payable}
                    disabled={!c.enabled}
                    onCheckedChange={() => void toggleFlag(c, "payable")}
                    aria-label={`${c.code} 允许支付开关`}
                  />
                </td>
                <td className="border-b px-3 py-2 last:border-b-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-destructive hover:text-destructive"
                    onClick={() => void removeCurrency(c.code)}
                    aria-label={`删除 ${c.code}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
        {"「允许支付」关闭后，前台仍可展示该币种换算，但下单/结账会拒绝以该币种结算。"}
      </p>
    </div>
  );
}

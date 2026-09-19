"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/admin/lang-provider";

/** 法务文档：键 = site_settings 存储键；labelKey = admin-i18n 词条 */
const DOCUMENTS = [
  { key: "policyAccessibility", labelKey: "无障碍声明", hint: "/pages/accessibility-statement" },
  { key: "policyPrivacy", labelKey: "隐私政策", hint: "/policies/privacy" },
  { key: "policyTerms", labelKey: "服务条款", hint: "/policies/terms" },
  { key: "policyRefund", labelKey: "退款政策", hint: "/policies/refund" },
  { key: "policyCookies", labelKey: "Cookie 政策", hint: "/policies/cookies" },
  { key: "policyDataSharingOptOut", labelKey: "您的隐私选择", hint: "/pages/data-sharing-opt-out" },
] as const;

type LegalKey = (typeof DOCUMENTS)[number]["key"];

/** 双语文档：{ zh, en }，各语言独立保存（空串 = 该语言使用内置默认） */
interface BiDoc {
  zh: string;
  en: string;
}

/**
 * 历史值兼容（与新 readPolicy 语义一致）：
 * - 单语字符串 → 双语同值（旧编辑器只存一份的存量，双语共用）
 * - { zh, en } 对象 → 原样取值（空/缺省 → 空串）
 */
function toEditablePair(value: unknown): BiDoc {
  if (typeof value === "string") return { zh: value, en: value };
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return {
      zh: typeof o.zh === "string" ? o.zh : "",
      en: typeof o.en === "string" ? o.en : "",
    };
  }
  return { zh: "", en: "" };
}

export default function LegalPagesPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<LegalKey | null>(null);
  const [docs, setDocs] = useState<Record<LegalKey, BiDoc>>(
    () =>
      Object.fromEntries(DOCUMENTS.map((d) => [d.key, { zh: "", en: "" }])) as Record<
        LegalKey,
        BiDoc
      >,
  );
  const [dirty, setDirty] = useState<Partial<Record<LegalKey, boolean>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ documents: Record<LegalKey, unknown> }>("/api/admin/legal");
      setDocs(
        Object.fromEntries(
          DOCUMENTS.map((d) => [d.key, toEditablePair(res.documents?.[d.key])]),
        ) as Record<LegalKey, BiDoc>,
      );
      setDirty({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载法务页面失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: LegalKey) => {
    setSavingKey(key);
    try {
      const { zh, en } = docs[key];
      // 始终保存 { zh, en } 双语对象；trim 后空串 = 该语言恢复内置默认
      await apiFetch("/api/admin/legal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: { zh: zh.trim(), en: en.trim() } }),
      });
      setDirty((d) => ({ ...d, [key]: false }));
      toast.success(t("Saved. The storefront page updates immediately."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save"));
    } finally {
      setSavingKey(null);
    }
  };

  const setLangText = (key: LegalKey, lang: "zh" | "en", text: string) => {
    setDocs((s) => ({ ...s, [key]: { ...s[key], [lang]: text } }));
    setDirty((d) => ({ ...d, [key]: true }));
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("Legal pages")}
        description={t(
          "Each document is edited per language (Chinese / English) and linked to the storefront page and the footer — the storefront updates immediately after saving.",
        )}
      />

      {loading ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-10 w-80" />
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="policyPrivacy">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                {DOCUMENTS.map((d) => (
                  <TabsTrigger key={d.key} value={d.key} className="gap-1.5">
                    {t(d.labelKey)}
                    {dirty[d.key] ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                  </TabsTrigger>
                ))}
              </TabsList>

              {DOCUMENTS.map((d) => (
                <TabsContent key={d.key} value={d.key} className="mt-4 space-y-3">
                  <p className="text-xs opacity-60">
                    {t("Frontend path")}:{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">{d.hint}</code>
                    {" · "}
                    {t(
                      "Lightweight markup: ## headings, - lists, **bold**. Clear a language's text to restore the built-in default for that language.",
                    )}
                  </p>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {t("Chinese content")}
                        <span className="ml-2 text-xs font-normal opacity-60">
                          {t("shown on the zh storefront")}
                        </span>
                      </p>
                      <Textarea
                        rows={16}
                        aria-label={t("Chinese content")}
                        className="font-mono text-xs leading-relaxed"
                        value={docs[d.key].zh}
                        onChange={(e) => setLangText(d.key, "zh", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {t("English content")}
                        <span className="ml-2 text-xs font-normal opacity-60">
                          {t("shown on the en storefront")}
                        </span>
                      </p>
                      <Textarea
                        rows={16}
                        aria-label={t("English content")}
                        className="font-mono text-xs leading-relaxed"
                        value={docs[d.key].en}
                        onChange={(e) => setLangText(d.key, "en", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void save(d.key)} disabled={savingKey !== null}>
                      {savingKey === d.key ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {t("Save")}
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

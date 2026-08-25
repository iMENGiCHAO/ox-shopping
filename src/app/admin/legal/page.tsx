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

/** 五份法务文档：键 = site_settings 存储键；labelKey = admin-i18n 词条 */
const DOCUMENTS = [
  { key: "policyAccessibility", labelKey: "Accessibility Statement", hint: "/pages/accessibility-statement" },
  { key: "policyPrivacy", labelKey: "Privacy Policy", hint: "/policies/privacy" },
  { key: "policyTerms", labelKey: "Terms of Service", hint: "/policies/terms" },
  { key: "policyRefund", labelKey: "Refund Policy", hint: "/policies/refund" },
  { key: "policyCookies", labelKey: "Cookie Policy", hint: "/policies/cookies" },
] as const;

type LegalKey = (typeof DOCUMENTS)[number]["key"];

type DocValue = string | { zh: string; en: string };

/** 历史值兼容：单语字符串原样展示；双语对象取 zh（空则 en）作为编辑底稿 */
function toEditable(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.zh === "string" && o.zh) return o.zh;
    if (typeof o.en === "string") return o.en;
  }
  return "";
}

export default function LegalPagesPage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<LegalKey | null>(null);
  const [docs, setDocs] = useState<Record<LegalKey, string>>(
    () => Object.fromEntries(DOCUMENTS.map((d) => [d.key, ""])) as Record<LegalKey, string>,
  );
  const [dirty, setDirty] = useState<Partial<Record<LegalKey, boolean>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ documents: Record<LegalKey, unknown> }>("/api/admin/legal");
      setDocs(
        Object.fromEntries(
          DOCUMENTS.map((d) => [d.key, toEditable(res.documents?.[d.key])]),
        ) as Record<LegalKey, string>,
      );
      setDirty({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load legal pages");
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
      await apiFetch("/api/admin/legal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: docs[key] }),
      });
      setDirty((d) => ({ ...d, [key]: false }));
      toast.success(t("Saved. The storefront page updates immediately."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save"));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("Legal pages")}
        description={t("Edit each legal document independently — Accessibility, Privacy, Terms, Refund and Cookie policies.")}
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
                    {t("Frontend path")}: <code className="rounded bg-muted px-1.5 py-0.5">{d.hint}</code>
                    {" · "}
                    {t("Lightweight markup: ## headings, - lists, **bold**. Clear the text to restore the built-in default.")}
                  </p>
                  <Textarea
                    rows={18}
                    className="font-mono text-xs leading-relaxed"
                    value={docs[d.key]}
                    onChange={(e) =>
                      setDocs((s) => ({ ...s, [d.key]: e.target.value }))
                    }
                    onInput={() => setDirty((s) => ({ ...s, [d.key]: true }))}
                  />
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

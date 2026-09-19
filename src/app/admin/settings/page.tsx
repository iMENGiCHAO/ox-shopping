"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Globe, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AccountSettings } from "@/components/admin/account-settings";
import { CurrencyManager } from "@/components/admin/currency-manager";
import { BrandLogoCard } from "@/components/admin/brand-logo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useT, useSiteName } from "@/components/admin/lang-provider";
const settingsFormSchema = z.object({
  siteName: z.string().trim().min(1, "请填写站点名称").max(60),
  siteDescription: z.string().max(200).default(""),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "邮箱格式不正确")
    .default(""),
  contactPhone: z.string().max(30).default(""),
  icp: z.string().max(64).default(""),
  seoKeywords: z.string().max(200).default(""),
  // Policy content — stored as the canonical (language-neutral) text. The service
  // layer wraps it as { zh, en } on read for the policy pages, which fall back to
  // the value when a language-specific entry is missing.
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

const DEFAULT_VALUES: SettingsFormValues = {
  siteName: "",
  siteDescription: "",
  contactEmail: "",
  contactPhone: "",
  icp: "",
  seoKeywords: "",
};

/** safely get a string value from arbitrary API key-value pairs (handles i18n objects). */
function pickString(settings: Record<string, unknown> | null | undefined, key: string): string {
  const v = settings?.[key];
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const obj = v as { zh?: unknown; en?: unknown };
    // Prefer the active editor language, then English, then any string we can find.
    if (typeof obj.zh === "string" && obj.zh) return obj.zh;
    if (typeof obj.en === "string" && obj.en) return obj.en;
  }
  return String(v);
}

export default function AdminSettingsPage() {
  const t = useT();
  // 当前生效的品牌名（服务端注入）——用作站名输入的占位示例，避免写死字面量
  const siteName = useSiteName();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [siteLogoUrl, setSiteLogoUrl] = React.useState("");
  const [siteLogoDarkArtwork, setSiteLogoDarkArtwork] = React.useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        settings: Record<string, unknown>;
        envStatus?: { mailProvider: string; storageDriver: string; currency: string };
      } | null>("/api/admin/settings");
      const settings = res?.settings && typeof res.settings === "object" ? res.settings : null;
      setSiteLogoUrl(typeof settings?.siteLogoUrl === "string" ? settings.siteLogoUrl : "");
      setSiteLogoDarkArtwork(settings?.siteLogoDarkArtwork === true);
      form.reset({
        siteName: pickString(settings, "siteName"),
        siteDescription: pickString(settings, "siteDescription"),
        contactEmail: pickString(settings, "contactEmail"),
        contactPhone: pickString(settings, "contactPhone"),
        icp: pickString(settings, "icp"),
        seoKeywords: pickString(settings, "seoKeywords"),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载站点设置失败");
    } finally {
      setLoading(false);
    }
  }, [form]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(values),
      });
      toast.success(t("Settings saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save settings"));
    } finally {
      setSaving(false);
    }
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title={t("System Settings")} description={t("Manage site info and SEO configuration")} />
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("System Settings")}
        description={t("Manage site info and SEO configuration")}
        actions={
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("Save Changes")}
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Site information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {t('Site information')}
            </CardTitle>
            <CardDescription>{t('Basic info shown in the site footer and contact page')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="st-name">{t('Site Name')} *</Label>
              <Input id="st-name" placeholder={siteName} {...form.register("siteName")} />
              {form.formState.errors.siteName ? (
                <p className="text-xs text-destructive">{form.formState.errors.siteName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-email">{t('Contact Email')}</Label>
              <Input
                id="st-email"
                type="email"
                placeholder="support@your-domain.com"
                {...form.register("contactEmail")}
              />
              {form.formState.errors.contactEmail ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.contactEmail.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-phone">{t('Contact Phone')}</Label>
              <Input id="st-phone" placeholder="+1 555 010 0000" {...form.register("contactPhone")} />
              {form.formState.errors.contactPhone ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.contactPhone.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-icp">{t("ICP filing number")}</Label>
              <Input id="st-icp" placeholder="例如 ICP-00000000" {...form.register("icp")} />
              {form.formState.errors.icp ? (
                <p className="text-xs text-destructive">{form.formState.errors.icp.message}</p>
              ) : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="st-desc">{t('Site Description')}</Label>
              <Textarea
                id="st-desc"
                rows={3}
                maxLength={200}
                placeholder={t("Describe your store in one line")}
                {...form.register("siteDescription")}
              />
              {form.formState.errors.siteDescription ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.siteDescription.message}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* 品牌 Logo — 前台顶栏即时生效 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Brand logo")}</CardTitle>
            <CardDescription>{t("Upload or replace the storefront logo")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandLogoCard initialUrl={siteLogoUrl} initialDarkArtwork={siteLogoDarkArtwork} />
          </CardContent>
        </Card>

        {/* SEO */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("SEO settings")}</CardTitle>
            <CardDescription>{t('Search engine keyword configuration')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="st-keywords">{t("Keywords (comma-separated)")}</Label>
            <Textarea
              id="st-keywords"
              rows={3}
              maxLength={200}
              placeholder="电商, 商城, 数码, 家电"
              {...form.register("seoKeywords")}
            />
            {form.formState.errors.seoKeywords ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.seoKeywords.message}
              </p>
            ) : null}
          </CardContent>
        </Card>


        {/* Currency & exchange rates — 统一管理入口 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Currency & exchange rates")}</CardTitle>
            <CardDescription>
              {t("Manage enabled currencies and exchange rates for the storefront")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CurrencyManager />
          </CardContent>
        </Card>
      </form>

      {/* My account: display name / password */}
      <AccountSettings />
    </div>
  );
}

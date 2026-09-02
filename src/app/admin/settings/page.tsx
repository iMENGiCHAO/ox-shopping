"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Globe, Info, Loader2, Save } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { useT } from "@/components/admin/lang-provider";
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
  announcementEnabled: z.boolean().default(false),
  announcement: z.string().max(200).default(""),
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
  announcementEnabled: false,
  announcement: "",
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

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [siteLogoUrl, setSiteLogoUrl] = React.useState("");

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ settings: Record<string, unknown> } | null>(
        "/api/admin/settings",
      );
      const settings = res?.settings && typeof res.settings === "object" ? res.settings : null;
      setSiteLogoUrl(typeof settings?.siteLogoUrl === "string" ? settings.siteLogoUrl : "");
      form.reset({
        siteName: pickString(settings, "siteName"),
        siteDescription: pickString(settings, "siteDescription"),
        contactEmail: pickString(settings, "contactEmail"),
        contactPhone: pickString(settings, "contactPhone"),
        icp: pickString(settings, "icp"),
        seoKeywords: pickString(settings, "seoKeywords"),
        announcementEnabled:
          settings?.announcementEnabled === true ||
          settings?.announcementEnabled === "true",
        announcement: pickString(settings, "announcement"),
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
              <Input id="st-name" placeholder={t("Ox Shopping")} {...form.register("siteName")} />
              {form.formState.errors.siteName ? (
                <p className="text-xs text-destructive">{form.formState.errors.siteName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-email">{t('Contact Email')}</Label>
              <Input
                id="st-email"
                type="email"
                placeholder="contact@example.com"
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
              <Input id="st-phone" placeholder="400-000-0000" {...form.register("contactPhone")} />
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

        {/* 公告栏 —— 开关+文案直达前台头部 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全站公告</CardTitle>
            <CardDescription>开启后文案将显示在前台页头下方的公告栏，适合促销与重要通知。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="st-ann-switch" className="cursor-pointer text-sm font-normal">
                在前台展示公告栏
              </Label>
              <Switch
                id="st-ann-switch"
                checked={form.watch("announcementEnabled")}
                onCheckedChange={(checked) => form.setValue("announcementEnabled", checked, { shouldDirty: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-ann">公告文案</Label>
              <Textarea
                id="st-ann"
                rows={2}
                maxLength={200}
                placeholder="例：全场满 299 元顺丰包邮 · 新客立减 30 元"
                {...form.register("announcement")}
              />
              {form.formState.errors.announcement ? (
                <p className="text-xs text-destructive">{form.formState.errors.announcement.message}</p>
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
            <BrandLogoCard initialUrl={siteLogoUrl} />
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

        {/* Environment variable notice */}
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t('Payment / email / storage sensitive config')}</p>
              <p className="mt-1">
                支付密钥（Stripe）、邮件服务（Resend/SMTP）、对象存储（S3）等敏感配置均通过环境变量（.env）管理，
                在此处不可编辑——如需修改请联系运维直接修改 .env 文件。
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("Save Changes")}
          </Button>
        </div>
      </form>

      {/* My account: display name / password */}
      <AccountSettings />
    </div>
  );
}

"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/admin/image-uploader";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/admin/lang-provider";

/**
 * 品牌 Logo 上传卡:
 * - 上传/粘贴图片 URL,保存到 site_settings.siteLogoUrl
 * - 前台顶栏即时生效(深色图案自动白色托底展示);空 = 恢复内置默认
 */
export function BrandLogoCard({
  initialUrl,
  initialDarkArtwork = false,
}: {
  initialUrl: string;
  /** 服务端测定的「图案偏暗」标记：暗色预览格据此反白，与前台顶栏保持一致 */
  initialDarkArtwork?: boolean;
}) {
  const t = useT();
  const [url, setUrl] = React.useState(initialUrl);
  const [darkArtwork, setDarkArtwork] = React.useState(initialDarkArtwork);
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteLogoUrl: url || null }),
      });
      // 服务端已对新 LOGO 测定明度，回读一次让预览与前台一致
      const res = await apiFetch<{ settings: Record<string, unknown> } | null>(
        "/api/admin/settings",
      );
      setDarkArtwork(res?.settings?.siteLogoDarkArtwork === true);
      toast.success(t("Brand logo updated. The storefront header updates immediately."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("Brand logo (transparent PNG recommended, ~3:1)")}</Label>
        <ImageUploader
          value={url ? [url] : []}
          onChange={(urls) => setUrl(urls[0] ?? "")}
          max={1}
        />
        <Input
          placeholder="https://... 或 /images/brand/logo.png"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      {/* 预览:亮底(实际用于白托底)与暗底两种效果 */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
        <p className="w-full text-xs text-muted-foreground">{t("Preview")}</p>
        <div className="flex items-center rounded-md border border-border bg-background px-3 py-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="logo 亮色背景预览" className="h-[40px] w-auto max-w-[200px] object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">{t("(default X logo)")}</span>
          )}
        </div>
        <div className="flex items-center rounded-md bg-ink px-3 py-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="logo 暗色背景预览"
              className={`h-[40px] w-auto max-w-[200px] object-contain${darkArtwork ? " invert" : ""}`}
              title={
                darkArtwork
                  ? t("Dark artwork detected — auto-inverted on the dark header, same as storefront")
                  : undefined
              }
            />
          ) : (
            <span className="text-xs text-muted-foreground">{t("(default X logo)")}</span>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("Save")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "Best with transparent background and light/white artwork for the dark header. If the artwork is dark, the storefront header auto-inverts it — clear to restore the built-in default.",
        )}
      </p>
    </div>
  );
}

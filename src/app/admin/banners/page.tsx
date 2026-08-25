"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ImageUploader } from "@/components/admin/image-uploader";
import { apiFetch } from "@/lib/fetch-client";

interface BannerSlot {
  image: string;
  href: string;
  title: string;
}

interface BannersConfig {
  homeLeft: BannerSlot;
  homeRight: BannerSlot;
  collectionsFallbackImage: string;
}

const EMPTY_SLOT: BannerSlot = { image: "", href: "", title: "" };

/**
 * 页面横幅管理 — 前台大图与后台解耦的管理入口：
 * 首页左右横幅（图/链接/标题，留空回落分类默认）+ 集合页兜底图。
 */
export default function AdminBannersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<BannersConfig>({
    homeLeft: { ...EMPTY_SLOT },
    homeRight: { ...EMPTY_SLOT },
    collectionsFallbackImage: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: BannersConfig }>("/api/admin/banners");
      setCfg({
        homeLeft: res.data.homeLeft ?? { ...EMPTY_SLOT },
        homeRight: res.data.homeRight ?? { ...EMPTY_SLOT },
        collectionsFallbackImage: res.data.collectionsFallbackImage ?? "",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/admin/banners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      toast.success("页面横幅已更新，前台即时生效");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const slotEditor = (
    key: "homeLeft" | "homeRight",
    label: string,
    hint: string,
  ) => (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs opacity-60">{hint}</p>
      </div>
      <ImageUploader
        value={cfg[key].image ? [cfg[key].image] : []}
        onChange={(urls) =>
          setCfg((c) => ({ ...c, [key]: { ...c[key], image: urls[0] ?? "" } }))
        }
        max={1}
      />
      <div className="grid gap-2.5">
        <Input
          placeholder="跳转链接（留空使用分类默认）"
          value={cfg[key].href}
          onChange={(e) => setCfg((c) => ({ ...c, [key]: { ...c[key], href: e.target.value } }))}
        />
        <Input
          placeholder="覆盖标题（留空显示分类名）"
          value={cfg[key].title}
          onChange={(e) => setCfg((c) => ({ ...c, [key]: { ...c[key], title: e.target.value } }))}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader title="页面横幅" description="管理首页大图等前台页面视觉内容，与代码解耦" />

      {loading ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-8 pt-6">
            <div className="grid gap-8 lg:grid-cols-2">
              {slotEditor("homeLeft", "首页 · 左侧横幅", "建议尺寸 1200×675（16:9），留空时使用第一个分类的图片")}
              {slotEditor("homeRight", "首页 · 右侧横幅", "建议尺寸 1200×675（16:9），留空时使用第二个分类的图片")}
            </div>

            <div className="border-t border-border pt-6">
              <p className="text-sm font-medium">集合页 · 兜底图</p>
              <p className="mt-0.5 text-xs opacity-60">分类未设置图片时的卡片占位图</p>
              <div className="mt-3 max-w-md">
                <ImageUploader
                  value={cfg.collectionsFallbackImage ? [cfg.collectionsFallbackImage] : []}
                  onChange={(urls) =>
                    setCfg((c) => ({ ...c, collectionsFallbackImage: urls[0] ?? "" }))
                  }
                  max={1}
                />
              </div>
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存并生效
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

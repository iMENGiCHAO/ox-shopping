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
}

interface AdminCategoryLite {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  parentId: string | null;
  bannerImage?: string | null;
}

const EMPTY_SLOT: BannerSlot = { image: "", href: "", title: "" };

/** 从槽位跳转链接解析目标分类 slug（/products?category=xxx） */
function categorySlugFromHref(href: string): string | null {
  const m = /[?&]category=([^&/#]+)/.exec(href || "");
  return m ? decodeURIComponent(m[1] ?? "") : null;
}

/**
 * 页面横幅管理 — 与首页两张集合入口一一对应：
 * 每个槽位 = 入口图(首页半宽) + 落地页大横幅(点进去后的全宽顶部图)。
 * 落地页大横幅写入对应分类的 bannerImage 字段。
 */
export default function AdminBannersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<BannersConfig>({
    homeLeft: { ...EMPTY_SLOT },
    homeRight: { ...EMPTY_SLOT },
  });
  const [categories, setCategories] = useState<AdminCategoryLite[]>([]);
  /** 每个槽位的落地页大横幅草稿：key = "homeLeft" | "homeRight" */
  const [landing, setLanding] = useState<Record<"homeLeft" | "homeRight", string>>({
    homeLeft: "",
    homeRight: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cats] = await Promise.all([
        apiFetch<{ data: BannersConfig }>("/api/admin/banners"),
        apiFetch<{ categories: AdminCategoryLite[] }>("/api/admin/categories"),
      ]);
      setCfg({
        homeLeft: res.data.homeLeft ?? { ...EMPTY_SLOT },
        homeRight: res.data.homeRight ?? { ...EMPTY_SLOT },
      });
      const flat = cats.categories ?? [];
      setCategories(flat);
      // 预填每个槽位的落地页大横幅当前值
      const byslug = new Map(flat.map((c) => [c.slug, c]));
      const top = flat.filter((c) => !c.parentId);
      const pick = (slot: BannerSlot, index: number) =>
        byslug.get(categorySlugFromHref(slot.href) ?? "") ??
        top[index] ??
        null;
      setLanding({
        homeLeft: pick(res.data.homeLeft ?? EMPTY_SLOT, 0)?.bannerImage ?? "",
        homeRight: pick(res.data.homeRight ?? EMPTY_SLOT, 1)?.bannerImage ?? "",
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

      // 落地页大横幅写入对应分类
      const byslug = new Map(categories.map((c) => [c.slug, c]));
      const top = categories.filter((c) => !c.parentId);
      for (const key of ["homeLeft", "homeRight"] as const) {
        const index = key === "homeLeft" ? 0 : 1;
        const slot = cfg[key];
        const target =
          byslug.get(categorySlugFromHref(slot.href) ?? "") ?? top[index] ?? null;
        if (!target) continue;
        if ((target.bannerImage ?? "") === landing[key]) continue;
        await apiFetch(`/api/admin/categories/${target.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bannerImage: landing[key] || null }),
        });
      }
      toast.success("页面横幅已更新，前台即时生效");
      await load();
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
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs opacity-60">{hint}</p>
      </div>

      {/* ① 首页入口图 */}
      <div className="space-y-2">
        <p className="text-xs font-medium opacity-80">① 首页入口图（半宽 16:9，建议 1200×675）</p>
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

      {/* ② 点击进入后的落地页大横幅 */}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium opacity-80">
          ② 落地页大横幅（点击进入后的全宽顶部图，建议 3490×1000）
        </p>
        <ImageUploader
          value={landing[key] ? [landing[key]] : []}
          onChange={(urls) => setLanding((s) => ({ ...s, [key]: urls[0] ?? "" }))}
          max={1}
        />
        <p className="text-xs opacity-50">
          将保存到该入口对应的分类；也可在「Categories」编辑该分类时修改。
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="页面横幅"
        description="首页左右两个集合入口：各自的上传入口图 + 点进去后的落地页大横幅"
      />

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
              {slotEditor("homeLeft", "首页 · 左侧横幅", "首页两张横幅之一；留空时使用第一个分类的图片")}
              {slotEditor("homeRight", "首页 · 右侧横幅", "首页两张横幅之二；留空时使用第二个分类的图片")}
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

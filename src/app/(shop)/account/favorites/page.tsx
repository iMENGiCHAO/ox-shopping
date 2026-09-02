"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetch-client";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import { useT } from "@/components/shop/lang-provider";
import { useCurrency } from "@/components/shop/currency-provider";
import { useFavorites } from "@/components/shop/favorites-provider";

interface FavoriteRow {
  id: string;
  productId: string;
  createdAt: string;
  product?: {
    id: string;
    slug: string;
    name: string;
    nameEn?: string | null;
    price: number | string;
    images: unknown;
    status: string;
  } | null;
  /** 关联的降价通知订阅状态 */
  priceAlert?: {
    id: string;
    unsubscribed: boolean;
    notifiedAt: string | null;
    notifiedPrice: number | null;
  } | null;
}

/** 我的收藏 — 收藏商品网格 + 降价通知状态管理
 *  收藏 = 关注 = 自动订阅降价通知（Favorite 1:1 PriceAlert） */
export default function FavoritesPage() {
  const [rows, setRows] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAlert, setBusyAlert] = useState<string | null>(null);
  const t = useT();
  const { format } = useCurrency();
  const { isFavorited, toggle } = useFavorites();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ favorites: FavoriteRow[] }>("/api/user/favorites");
      setRows(r.favorites ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Operation failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (productId: string) => {
    setBusy(productId);
    try {
      await toggle(productId);
    } finally {
      setBusy(null);
    }
  };

  /** 切换降价通知订阅（不取消收藏） */
  const toggleAlert = async (row: FavoriteRow) => {
    if (!row.priceAlert) return;
    setBusyAlert(row.priceAlert.id);
    try {
      const action = row.priceAlert.unsubscribed ? "resubscribe" : "unsubscribe";
      const r = await apiFetch<{ ok: boolean }>("/api/price-alerts", {
        method: "PATCH",
        body: JSON.stringify({ id: row.priceAlert.id, action }),
      });
      if (r?.ok) {
        setRows((prev) =>
          prev.map((x) =>
            x.id === row.id && x.priceAlert
              ? {
                  ...x,
                  priceAlert: {
                    ...x.priceAlert,
                    unsubscribed: !x.priceAlert.unsubscribed,
                  },
                }
              : x,
          ),
        );
        toast.success(
          row.priceAlert.unsubscribed ? t("Resubscribed to price alerts") : t("Price alerts disabled"),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Operation failed"));
    } finally {
      setBusyAlert(null);
    }
  };

  const visible = rows.filter((r) => isFavorited(r.productId));
  const activeAlerts = visible.filter((r) => r.priceAlert && !r.priceAlert.unsubscribed).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{t("My Favorites")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {visible.length} {t("item(s)")}
          {activeAlerts > 0 ? (
            <>
              {" · "}
              <span className="text-primary">
                {t("{n} with price alerts on", { n: activeAlerts })}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-border py-16 text-center">
          <Heart className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">{t("No favorites yet")}</p>
          <Link
            href="/products"
            className="mt-4 inline-flex h-10 items-center border border-border px-6 text-sm text-foreground transition-colors hover:bg-muted"
          >
            {t("Browse products")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {visible.map((r) => {
            const p = r.product;
            const priceNum = p ? Number(p.price) : 0;
            const drop = r.priceAlert?.notifiedPrice
              ? priceNum - r.priceAlert.notifiedPrice
              : 0;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
              >
                {/* 商品图 + 名 + 价 */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {p ? (
                    <Link
                      href={`/products/${p.slug}`}
                      className="relative h-16 w-16 shrink-0 overflow-hidden border border-border bg-muted sm:h-20 sm:w-20"
                    >
                      <ImageWithFallback
                        src={
                          Array.isArray(p.images) && p.images[0]
                            ? String(p.images[0])
                            : undefined
                        }
                        alt=""
                        fill
                        sizes="80px"
                        className="object-contain p-1"
                      />
                    </Link>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    {p ? (
                      <Link
                        href={`/products/${p.slug}`}
                        className="line-clamp-1 text-sm font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("Product removed")}
                      </p>
                    )}
                    <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                      {p ? format(priceNum) : "—"}
                    </p>
                    {/* 降价状态行 */}
                    {r.priceAlert ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {r.priceAlert.unsubscribed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                            <BellOff className="h-2.5 w-2.5" />
                            {t("Price alerts off")}
                          </span>
                        ) : drop > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 font-medium text-success">
                            <Bell className="h-2.5 w-2.5" />
                            {t("Price dropped {amount} — notified", { amount: format(drop) })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                            <Bell className="h-2.5 w-2.5" />
                            {t("Price alerts on")}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* 操作区 */}
                <div className="flex flex-shrink-0 items-center justify-end gap-2">
                  {r.priceAlert ? (
                    <button
                      type="button"
                      onClick={() => void toggleAlert(r)}
                      disabled={busyAlert === r.priceAlert.id}
                      className="inline-flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-[11px] text-foreground/80 transition-colors hover:bg-muted disabled:opacity-50"
                      title={
                        r.priceAlert.unsubscribed
                          ? t("Resubscribe to price alerts")
                          : t("Disable price alerts (keeps the favorite)")
                      }
                    >
                      {busyAlert === r.priceAlert.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : r.priceAlert.unsubscribed ? (
                        <Bell className="h-3 w-3" />
                      ) : (
                        <BellOff className="h-3 w-3" />
                      )}
                      {r.priceAlert.unsubscribed ? t("Enable alerts") : t("Disable alerts")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy === r.productId}
                    onClick={() => void remove(r.productId)}
                    aria-label={t("Remove from favorites")}
                    className="inline-flex h-7 items-center gap-1 rounded border border-destructive/40 bg-card px-2 text-[11px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {busy === r.productId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Heart className="h-3 w-3 fill-current" />
                    )}
                    {t("Remove favorite")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {t("Favorites auto-enable price alerts. Removing a favorite also cancels alerts. Use the toggle to disable alerts while keeping the favorite.")}
      </p>
    </div>
  );
}

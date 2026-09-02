"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Package, RefreshCw, Tag, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useT, useShopLang } from "@/components/shop/lang-provider";
import { apiFetch } from "@/lib/fetch-client";

interface NotificationRow {
  id: string;
  type: "order" | "refund" | "price_alert" | "system";
  title: string;
  titleEn: string | null;
  body: string;
  bodyEn: string | null;
  link: string | null;
  isUnread: boolean;
  createdAt: string;
}

const TYPE_META: Record<
  NotificationRow["type"],
  { icon: React.ReactNode; color: string }
> = {
  order: { icon: <Package className="h-4 w-4" />, color: "text-primary" },
  refund: { icon: <Wallet className="h-4 w-4" />, color: "text-warning" },
  price_alert: { icon: <Tag className="h-4 w-4" />, color: "text-success" },
  system: { icon: <Bell className="h-4 w-4" />, color: "text-muted-foreground" },
};

/** 站内消息中心（个人中心"消息"页） */
export default function NotificationsPage() {
  const t = useT();
  const { lang } = useShopLang();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // 刷新未读数（用于在 markRead 后让顶栏 Bell 同步）
  const refreshUnread = useCallback(async () => {
    try {
      const res = await apiFetch<{ unreadCount: number }>("/api/notifications");
      // 通知顶栏 bell 角标（事件总线）
      window.dispatchEvent(new CustomEvent("notifications:changed", { detail: { unread: res.unreadCount ?? 0 } }));
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: NotificationRow[]; unreadCount: number }>(
        filter === "unread" ? "/api/notifications?unreadOnly=true" : "/api/notifications",
      );
      setRows(res.notifications ?? []);
      setUnread(res.unreadCount ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const markOne = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/notifications/${id}`, { method: "PATCH" });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isUnread: false } : r)));
      setUnread((u) => Math.max(u - 1, 0));
      refreshUnread();
    } catch {
      // 静默
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    try {
      const res = await apiFetch<{ marked: number }>("/api/notifications", { method: "PATCH" });
      setRows((prev) => prev.map((r) => ({ ...r, isUnread: false })));
      setUnread(0);
      toast.success(t("All marked as read ({n})", { n: res.marked }));
      refreshUnread();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Operation failed"));
    }
  };

  /** 删除单条消息（用户本人） */
  const removeOne = async (id: string) => {
    setBusyId(id);
    try {
      const target = rows.find((r) => r.id === id);
      await apiFetch(`/api/notifications/${id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (target?.isUnread) setUnread((u) => Math.max(0, u - 1));
      toast.success(t("Deleted"));
      refreshUnread();
    } catch {
      toast.error(t("Operation failed"));
    } finally {
      setBusyId(null);
    }
  };

  /** 清空已读 */
  const clearRead = async () => {
    try {
      const res = await apiFetch<{ ok: boolean; deleted: number }>(
        "/api/notifications?readOnly=true",
        { method: "DELETE" },
      );
      setRows((prev) => prev.filter((r) => r.isUnread));
      toast.success(t("Cleared {n} read messages", { n: res.deleted ?? 0 }));
      refreshUnread();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Operation failed"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Notifications")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unread > 0
              ? t("You have {n} unread messages", { n: unread })
              : t("All caught up")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* filter tabs */}
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded px-2.5 py-1 ${filter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("All")}
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`rounded px-2.5 py-1 ${filter === "unread" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("Unread")}
              {unread > 0 ? (
                <span className="ml-1 rounded bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {unread}
                </span>
              ) : null}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("Refresh")}
            title={t("Refresh")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAll()}
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("Mark all read")}
            </button>
          ) : null}
          {rows.some((r) => !r.isUnread) ? (
            <button
              type="button"
              onClick={() => void clearRead()}
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("Clear read")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Clear read")}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-md border border-border bg-card"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-8 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {filter === "unread" ? t("No unread messages") : t("No messages yet")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {rows.map((r) => {
            const meta = TYPE_META[r.type] ?? TYPE_META.system;
            const title = lang === "zh" ? r.title : (r.titleEn ?? r.title);
            const body = lang === "zh" ? r.body : (r.bodyEn ?? r.body);
            const Content = (
              <div
                className={`flex items-start gap-3 p-3 ${
                  r.isUnread ? "bg-primary/[0.03]" : ""
                }`}
              >
                <span className={`mt-0.5 ${meta.color}`}>{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className={`text-sm ${r.isUnread ? "font-semibold" : "font-medium"}`}>
                      {title}
                    </p>
                    {r.isUnread ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {body}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    {new Date(r.createdAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={r.id} className="group relative">
                {r.link ? (
                  <Link
                    href={r.link}
                    className="block transition-colors hover:bg-muted/50"
                    onClick={() => {
                      if (r.isUnread) void markOne(r.id);
                    }}
                  >
                    {Content}
                  </Link>
                ) : (
                  <div className="block">{Content}</div>
                )}
                {/* hover 工具：已读(在显示时) + 删除(总是提供) */}
                <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {r.isUnread ? (
                    <button
                      type="button"
                      onClick={() => void markOne(r.id)}
                      disabled={busyId === r.id}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={t("Mark as read")}
                      title={t("Mark as read")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void removeOne(r.id)}
                    disabled={busyId === r.id}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    aria-label={t("Delete")}
                    title={t("Delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

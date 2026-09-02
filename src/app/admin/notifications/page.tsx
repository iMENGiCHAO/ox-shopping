"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, Inbox, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { apiFetch } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  titleEn: string | null;
  body: string;
  bodyEn: string | null;
  link: string | null;
  meta: unknown;
  isUnread: boolean;
  createdAt: string;
}

/** 后台消息中心 — 前端动作（新订单/退款/新用户/补货提醒）的站内反馈，不静默 */
export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 删除确认弹窗：single=删单条、readOnly=清空已读、all=清空全部
  const [confirm, setConfirm] = useState<{
    mode: "single" | "readOnly" | "all";
    id?: string;
    title?: string;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: AdminNotification[]; unreadCount: number }>(
        "/api/admin/notifications",
      );
      setRows(res.notifications ?? []);
      setUnread(res.unreadCount ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markOne = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/notifications?id=${id}`, { method: "PATCH" });
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, isUnread: false } : r)));
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      toast.error("操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    try {
      await apiFetch("/api/admin/notifications", { method: "PATCH" });
      setRows((rs) => rs.map((r) => ({ ...r, isUnread: false })));
      setUnread(0);
      toast.success("已全部标记为已读");
    } catch {
      toast.error("操作失败");
    }
  };

  /** 统一删除入口：single / readOnly / all */
  const doDelete = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      const q =
        confirm.mode === "single"
          ? `id=${encodeURIComponent(confirm.id ?? "")}`
          : confirm.mode === "readOnly"
            ? "readOnly=true"
            : "all=true";
      const res = await apiFetch<{ deleted: number }>(`/api/admin/notifications?${q}`, {
        method: "DELETE",
      });
      const deleted = res.deleted ?? 0;

      if (confirm.mode === "single") {
        // 同步未读数：若删除的是未读
        const target = rows.find((r) => r.id === confirm.id);
        setRows((rs) => rs.filter((r) => r.id !== confirm.id));
        if (target?.isUnread) setUnread((u) => Math.max(0, u - 1));
        toast.success("已删除该消息");
      } else if (confirm.mode === "readOnly") {
        setRows((rs) => rs.filter((r) => r.isUnread));
        toast.success(`已清空 ${deleted} 条已读消息`);
      } else {
        setRows([]);
        setUnread(0);
        toast.success(`已清空全部 ${deleted} 条消息`);
      }
      setConfirm(null);
    } catch {
      toast.error("删除失败");
    } finally {
      setConfirmBusy(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "order":
        return "订单";
      case "refund":
        return "退款";
      case "price_alert":
        return "价格";
      default:
        return "系统";
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="消息中心"
        description="前端客户动作（新订单 / 退款申请 / 新用户注册 / 补货提醒）的站内反馈，确保运营信息不静默"
        actions={
          <div className="flex items-center gap-2">
            {unread > 0 ? (
              <Button size="sm" variant="outline" onClick={() => void markAll()}>
                <CheckCheck className="h-3.5 w-3.5" />
                全部已读
              </Button>
            ) : null}
            {rows.some((r) => !r.isUnread) ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm({ mode: "readOnly" })}
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空已读
              </Button>
            ) : null}
            {rows.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirm({ mode: "all" })}
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空全部
              </Button>
            ) : null}
          </div>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">暂无消息</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/40",
                    n.isUnread && "bg-primary/[0.03]",
                  )}
                >
                  {/* 未读圆点 + 类型徽标 */}
                  <div className="mt-0.5 flex w-14 shrink-0 items-center gap-1.5">
                    {n.isUnread ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="未读" />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-border" aria-hidden />
                    )}
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {typeIcon(n.type)}
                    </span>
                  </div>

                  {/* 内容 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className={cn("text-[13px]", n.isUnread ? "font-semibold" : "font-medium")}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={n.body}>
                      {n.body}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3">
                      {n.link ? (
                        <Link
                          href={n.link}
                          className="text-[12px] font-medium text-primary hover:underline"
                        >
                          去处理 →
                        </Link>
                      ) : null}
                      {n.isUnread ? (
                        <button
                          type="button"
                          onClick={() => void markOne(n.id)}
                          disabled={busyId === n.id}
                          className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                        >
                          标为已读
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setConfirm({ mode: "single", id: n.id, title: n.title })}
                        className="text-[12px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(v) => {
          if (!confirmBusy) setConfirm(v ? confirm : null);
        }}
        title={
          confirm?.mode === "single"
            ? "删除这条消息？"
            : confirm?.mode === "readOnly"
              ? "清空全部已读消息？"
              : "清空所有消息？"
        }
        description={
          confirm?.mode === "single"
            ? `即将删除「${confirm.title ?? ""}」，删除后无法恢复。`
            : confirm?.mode === "readOnly"
              ? "将删除所有已读消息（未读消息保留），删除后无法恢复。"
              : "将删除全部消息（含未读），删除后无法恢复，请谨慎操作。"
        }
        confirmText="删除"
        destructive
        loading={confirmBusy}
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}

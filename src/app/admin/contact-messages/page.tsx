"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Mail, MailOpen, Reply, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/fetch-client";
import { cn } from "@/lib/utils";

/**
 * 客服留言收件箱（缺陷报告 P1-7）。
 *
 * 背景：`contact_messages` 此前只写不读 —— 顾客留言后，后台没有任何入口查看/跟进，
 * 只有一封内部通知邮件（未配置邮件服务时连邮件都没有，只落日志）。
 * 本页提供：状态筛选（新留言 Tab 带角标）、状态流转（已读/已回复/垃圾）、
 * 内部备注、以及一键复制顾客邮箱回复。
 */

type Status = "new" | "read" | "replied" | "spam";

interface MessageRow {
  id: string;
  name: string;
  email: string;
  message: string;
  lang: string;
  status: string;
  source: string;
  ip: string | null;
  note: string | null;
  createdAt: string;
}

interface ListResponse {
  items: MessageRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<Status, number>;
}

const STATUS_TABS: { key: Status | "all"; label: string }[] = [
  { key: "new", label: "新留言" },
  { key: "read", label: "已读" },
  { key: "replied", label: "已回复" },
  { key: "spam", label: "垃圾" },
  { key: "all", label: "全部" },
];

const STATUS_LABEL: Record<Status, string> = {
  new: "新留言",
  read: "已读",
  replied: "已回复",
  spam: "垃圾",
};

const STATUS_STYLE: Record<Status, string> = {
  new: "border-transparent bg-blue-100 text-blue-800",
  read: "border-transparent bg-muted text-muted-foreground",
  replied: "border-transparent bg-emerald-100 text-emerald-800",
  spam: "border-transparent bg-rose-100 text-rose-800",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

export default function ContactMessagesPage() {
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [counts, setCounts] = useState<Record<Status, number>>({
    new: 0,
    read: 0,
    replied: 0,
    spam: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Status | "all">("new");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 备注草稿（未保存前不写库） */
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (tab !== "all") qs.set("status", tab);
        const data = await apiFetch<ListResponse>(
          `/api/admin/contact-messages?${qs.toString()}`,
        );
        setRows(data.items ?? []);
        setCounts(data.counts ?? { new: 0, read: 0, replied: 0, spam: 0 });
        setTotal(data.total ?? 0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [page, tab],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Tab 切换：回到第 1 页（否则会停在超出范围的页码看到空列表） */
  const switchTab = (next: Status | "all") => {
    setTab(next);
    setPage(1);
  };

  /** 更新状态；顺带把备注一并提交（客服常先写备注再改状态） */
  const update = async (row: MessageRow, patch: { status?: Status; note?: string }) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch<{ message: MessageRow }>(
        `/api/admin/contact-messages/${row.id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      const updated = res?.message;
      // 状态变更可能让当前筛选下的这一行「不该再出现」——直接本地移除，再静默刷新计数
      if (patch.status && patch.status !== row.status && tab !== "all" && patch.status !== tab) {
        setRows((rs) => rs.filter((r) => r.id !== row.id));
        setTotal((t) => Math.max(0, t - 1));
      } else if (updated) {
        setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      }
      void load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新失败");
    } finally {
      setBusyId(null);
    }
  };

  const saveNote = async (row: MessageRow) => {
    const draft = noteDraft[row.id];
    if (draft === undefined) return;
    await update(row, { note: draft });
    setNoteDraft((d) => {
      const next = { ...d };
      delete next[row.id];
      return next;
    });
    toast.success("备注已保存");
  };

  const unreadBadge = useMemo(() => counts.new ?? 0, [counts]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="客服留言"
        description="顾客通过「联系我们」提交的留言。请及时标记处理状态并回复顾客邮箱；状态与备注仅内部可见。"
      />

      {/* 状态筛选：新留言 Tab 带未处理角标 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const active = tab === t.key;
          const count = t.key === "all" ? undefined : counts[t.key as Status];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-foreground/20 bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {count !== undefined ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    active ? "bg-background/20" : "bg-muted",
                    t.key === "new" && count > 0 && !active ? "bg-blue-100 text-blue-800" : "",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {tab === "new" && unreadBadge === 0 ? "没有新留言，全部已处理" : "该分类下暂无留言"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const status = (row.status as Status) ?? "new";
            const busy = busyId === row.id;
            return (
              <Card key={row.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.name}</span>
                        <a
                          href={`mailto:${row.email}`}
                          className="text-sm text-foreground/80 underline decoration-border underline-offset-2 hover:text-foreground"
                        >
                          {row.email}
                        </a>
                        <Badge className={cn("uppercase", STATUS_STYLE[status])}>
                          {STATUS_LABEL[status] ?? row.status}
                        </Badge>
                        <Badge variant="outline" className="uppercase">
                          {row.lang}
                        </Badge>
                        {row.source !== "contact-page" ? (
                          <Badge variant="outline">{row.source}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDate(row.createdAt)}
                        {row.ip ? ` · IP ${row.ip}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || status === "read"}
                        onClick={() => void update(row, { status: "read" })}
                      >
                        <MailOpen className="mr-1 h-3.5 w-3.5" />
                        已读
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || status === "replied"}
                        onClick={() => void update(row, { status: "replied" })}
                      >
                        <Reply className="mr-1 h-3.5 w-3.5" />
                        已回复
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || status === "spam"}
                        onClick={() => void update(row, { status: "spam" })}
                      >
                        <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                        垃圾
                      </Button>
                      {status !== "new" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void update(row, { status: "new" })}
                        >
                          <Mail className="mr-1 h-3.5 w-3.5" />
                          恢复待处理
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* whitespace-pre-wrap：留言可能多行，原样展示（React 已转义） */}
                  <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                    {row.message}
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Textarea
                      value={noteDraft[row.id] ?? row.note ?? ""}
                      onChange={(e) =>
                        setNoteDraft((d) => ({ ...d, [row.id]: e.target.value }))
                      }
                      placeholder="内部备注（仅后台可见，例如：已电话回复 / 已补发优惠券）"
                      rows={2}
                      className="min-h-[60px] flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={busy || noteDraft[row.id] === undefined}
                      onClick={() => void saveNote(row)}
                    >
                      保存备注
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            共 {total} 条 · 第 {page}/{pageCount} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

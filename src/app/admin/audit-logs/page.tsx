"use client";

import * as React from "react";
import { ScrollText } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminAuditLog, AdminListResult } from "@/components/admin/types";

import { useT } from "@/components/admin/lang-provider";
const PAGE_SIZE = 20;

/**  safely display meta: truncated to one line */
function metaPreview(meta: unknown): string {
  if (meta === null || meta === undefined) return "-";
  try {
    const s = typeof meta === "string" ? meta : JSON.stringify(meta);
    return s.length > 100 ? `${s.slice(0, 100)}…` : s;
  } catch {
    return "-";
  }
}

export default function AdminAuditLogsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [action, setAction] = React.useState("");
  const [debouncedAction, setDebouncedAction] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [debouncedUserId, setDebouncedUserId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedAction(action.trim());
      setDebouncedUserId(userId.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [action, userId]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedAction, debouncedUserId, from, to]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedAction) params.set("action", debouncedAction);
    if (debouncedUserId) params.set("userId", debouncedUserId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<AdminAuditLog>>(
        `/api/admin/audit-logs?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedAction, debouncedUserId, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = () => {
    setAction("");
    setUserId("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("Audit Logs")} description="Sensitive admin operations for security auditing and traceability" />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="log-action" className="text-xs">
                Action
              </Label>
              <Input
                id="log-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="e.g. product.update"
                className="h-9 w-52"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-user" className="text-xs">
                Operator ID
              </Label>
              <Input
                id="log-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="operator id"
                className="h-9 w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-from" className="text-xs">
                Start date
              </Label>
              <Input
                id="log-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-to" className="text-xs">
                End date
              </Label>
              <Input
                id="log-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><Table className="min-w-[880px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t('Time')}</TableHead>
                <TableHead className="w-40">Operator</TableHead>
                <TableHead className="w-44">action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="w-28">{t('IP')}</TableHead>
                <TableHead>meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 6 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={<ScrollText className="h-6 w-6" />}
                      title={t("No log entries")}
                      description="Try adjusting your filters"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      {log.user ? (
                        <>
                          <div className="truncate text-sm">{log.user.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {log.user.email}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">system</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {log.action}
                      </code>
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <div className="truncate text-xs">
                        {log.entity ? (
                          <>
                            <span className="text-muted-foreground">{log.entity}</span>
                            {log.entityId ? (
                              <span className="ml-1 font-mono">{log.entityId}</span>
                            ) : null}
                          </>
                        ) : (
                          "-"
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ip ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div
                        className="truncate font-mono text-xs text-muted-foreground"
                        title={metaPreview(log.meta)}
                      >
                        {metaPreview(log.meta)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table></div>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-end"
      />
    </div>
  );
}

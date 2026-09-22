"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, Shuffle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "../_shared";

interface RebindRow {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  fromDistributorName: string | null;
  toDistributorName: string;
  status: string;
  requestedNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const EMPTY: PaginationMeta = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

const STATUS: Record<string, { label: string; variant: "warning" | "success" | "destructive" }> = {
  PENDING: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已通过", variant: "success" },
  REJECTED: { label: "已驳回", variant: "destructive" },
};

/**
 * 换绑审核（P1-8）。
 *
 * 换绑会把一个客户（及其整棵下级子树的佣金链）从 A 分销商改到 B 名下 —— 这是**资金关系变更**，
 * 因此即便后台开启了 allowRebind，系统也只「受理」而不自动生效：客户点别人链接时生成一条待审核申请，
 * 由平台确认后才真正落库（落库时重建子树闭包，避免下级继续按旧链分佣 → 见 P0-3）。
 */
export default function AdminDistributionRebindsPage() {
  const [rows, setRows] = React.useState<RebindRow[]>([]);
  const [pagination, setPagination] = React.useState<PaginationMeta>(EMPTY);
  const [pending, setPending] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<"PENDING" | "APPROVED" | "REJECTED" | "">("PENDING");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (s) params.set("status", s);
      /* `json({ data, pending, pagination })` → apiFetch 剥一层信封后即为此形状 */
      const res = await apiFetch<{
        data: RebindRow[];
        pending: number;
        pagination: PaginationMeta;
      }>(`/api/admin/distribution/rebinds?${params}`);
      setRows(res.data);
      setPending(res.pending);
      setPagination(res.pagination);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载换绑申请失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(page, status);
  }, [load, page, status]);

  const review = async (row: RebindRow, action: "approve" | "reject") => {
    const note = (notes[row.id] ?? "").trim();
    if (action === "reject" && note.length < 2) {
      toast.error("驳回请填写原因（这条会写进审核记录）");
      return;
    }
    setBusyId(row.id);
    try {
      await apiFetch("/api/admin/distribution/rebinds", {
        method: "POST",
        body: JSON.stringify({ requestId: row.id, action, ...(note ? { note } : {}) }),
      });
      toast.success(action === "approve" ? "换绑已生效（子树佣金链同步重建）" : "已驳回该换绑申请");
      await load(page, status);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="换绑审核"
        description="换绑会改变客户（及其下级子树）的佣金归属，属于资金关系变更：客户点他人链接只会生成申请，必须由平台确认后才生效"
        actions={
          <Button variant="outline" onClick={() => void load(page, status)} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            刷新
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shuffle className="h-4 w-4" />
              换绑申请
            </CardTitle>
            <CardDescription>
              待审核 <span className="font-medium">{pending}</span> 条 · 共 {pagination.total} 条
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(["PENDING", "APPROVED", "REJECTED", ""] as const).map((s) => (
              <Button
                key={s || "all"}
                variant={status === s ? "secondary" : "ghost"}
                size="sm"
                className="h-8"
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
              >
                {s ? STATUS[s]!.label : "全部"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Shuffle className="h-5 w-5" />}
              title="没有换绑申请"
              description="当客户在已绑定状态下点击另一位分销商的链接时，这里会生成一条待审核申请。"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-0">客户</TableHead>
                    <TableHead className="min-w-0">原归属</TableHead>
                    <TableHead className="min-w-0">目标归属</TableHead>
                    <TableHead className="w-[100px]">状态</TableHead>
                    <TableHead className="w-[170px]">申请时间</TableHead>
                    <TableHead className="min-w-0">审核备注</TableHead>
                    <TableHead className="w-[230px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="min-w-0">
                        <div className="text-sm font-medium">{r.customerName}</div>
                        <div className="text-xs text-muted-foreground">{r.customerEmail}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.fromDistributorName ?? "（自然流量，无上级）"}
                      </TableCell>
                      <TableCell className="text-sm">{r.toDistributorName}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS[r.status]?.variant ?? "secondary"}>
                          {STATUS[r.status]?.label ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell className="min-w-0 text-xs text-muted-foreground">
                        {r.reviewNote || r.requestedNote || "-"}
                      </TableCell>
                      <TableCell>
                        {r.status === "PENDING" ? (
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              value={notes[r.id] ?? ""}
                              onChange={(e) =>
                                setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                              placeholder="审核备注"
                              className="h-8 w-24 text-xs"
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={busyId === r.id}
                              onClick={() => void review(r, "approve")}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              通过
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              disabled={busyId === r.id}
                              onClick={() => void review(r, "reject")}
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" />
                              驳回
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {r.reviewedAt ? formatDateTime(r.reviewedAt) : "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {pagination.totalPages > 1 ? (
            <div className="mt-4">
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

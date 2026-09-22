"use client";

import * as React from "react";
import { CheckCircle2, Eye, KeyRound, RefreshCw, Search, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminDrawer, AdminDrawerHeader } from "@/components/admin/admin-drawer";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { CellPair, CellText } from "@/components/admin/cell-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AdminListResult,
  AdminPasswordResetRequest,
  AdminPasswordResetStatus,
  AdminPasswordResetStatusCounts,
  ApprovePasswordResetResult,
} from "@/components/admin/types";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<AdminPasswordResetStatus, string> = {
  PENDING: "待处理",
  APPROVED: "已批准",
  REJECTED: "已驳回",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("zh-CN");
}

/**
 * 找回密码申请管理（B-2 原站式人工审批流）。
 *
 * 闭环位置：前台 `找回密码` 表单提交申请 → 本页待处理列表 → 管理员批准/驳回
 * → 批准时服务端生成强随机临时密码并邮件下发，账号被置为「首登强制改密」。
 *
 * 两个刻意不做的事：
 *   1. 不提供「直接改密」入口 —— 管理员改密是 `/admin/users` 的既有能力，
 *      本页的语义是**审批找回申请**，混在一起会让审计日志说不清是谁改的密码；
 *   2. 批准后的临时密码不落库、不回显历史 —— 响应里只出现一次，
 *      刷新即不可再取（用户手里有邮件，管理员手里有这一次明文）。
 */
export default function AdminPasswordResetsPage() {
  const [rows, setRows] = React.useState<AdminPasswordResetRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "PENDING" | "APPROVED" | "REJECTED" | "all"
  >("PENDING");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectNote, setRejectNote] = React.useState("");
  /** 三态计数（统计卡）；接口一次返回，首屏为 0 直到加载完成 */
  const [statusCounts, setStatusCounts] = React.useState<AdminPasswordResetStatusCounts>({
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  });

  const [detail, setDetail] = React.useState<AdminPasswordResetRequest | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  /** 批准后的一次性明文弹窗 */
  const [issued, setIssued] = React.useState<ApprovePasswordResetResult | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter !== "all") params.set("status", statusFilter);
    setLoading(true);
    try {
      const res = await apiFetchRaw<
        AdminListResult<AdminPasswordResetRequest> & {
          pendingCount: number;
          statusCounts?: AdminPasswordResetStatusCounts;
        }
      >(`/api/admin/password-resets?${params.toString()}`);
      setRows(res.data ?? []);
      setTotalPages(res.pagination?.totalPages ?? 1);
      setStatusCounts(
        res.statusCounts ?? { PENDING: res.pendingCount ?? 0, APPROVED: 0, REJECTED: 0 },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载找回密码申请失败");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** 批准：服务端发临时密码 + 标记首登改密 + 吊销旧会话（不可逆，二次确认） */
  const approve = async (row: AdminPasswordResetRequest) => {
    const name = row.user?.name ?? row.email;
    const ok = window.confirm(
      `确认批准 ${name}（${row.email}）的找回密码申请？\n\n` +
        `批准后将立即执行：\n` +
        `· 生成强随机临时密码并发送到该邮箱\n` +
        `· 该账号全部登录会话失效，必须用临时密码重新登录\n` +
        `· 首次登录被强制修改密码`,
    );
    if (!ok) return;

    setBusyId(row.id);
    try {
      const res = await apiFetch<ApprovePasswordResetResult>(
        `/api/admin/password-resets/${row.id}`,
        { method: "POST", body: JSON.stringify({ action: "approve" }) },
      );
      setIssued(res);
      setDetailOpen(false);
      toast.success("已批准，临时密码已下发");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批准失败");
    } finally {
      setBusyId(null);
    }
  };

  /** 驳回：原因随邮件告知用户，账号密码不变 */
  const reject = async (row: AdminPasswordResetRequest) => {
    const ok = window.confirm(`确认驳回 ${row.user?.name ?? row.email} 的找回密码申请？`);
    if (!ok) return;

    setBusyId(row.id);
    try {
      await apiFetch(`/api/admin/password-resets/${row.id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          ...(rejectNote.trim() ? { note: rejectNote.trim() } : {}),
        }),
      });
      setDetailOpen(false);
      setRejectNote("");
      toast.success("已驳回，结果已邮件告知客户");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "驳回失败");
    } finally {
      setBusyId(null);
    }
  };

  const copyTemp = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("临时密码已复制");
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="找回密码"
        description="审核客户的找回密码申请；批准后系统下发强随机临时密码，客户首次登录须强制改密"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{statusCounts.PENDING}</p>
              <p className="text-xs text-muted-foreground">待处理申请</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{statusCounts.APPROVED}</p>
              <p className="text-xs text-muted-foreground">已批准（累计）</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{statusCounts.REJECTED}</p>
              <p className="text-xs text-muted-foreground">已驳回（累计）</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索邮箱 / 客户姓名"
                className="h-10 w-64 pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as "PENDING" | "APPROVED" | "REJECTED" | "all")
              }
            >
              <SelectTrigger className="w-36" aria-label="按状态筛选">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">待处理</SelectItem>
                <SelectItem value="APPROVED">已批准</SelectItem>
                <SelectItem value="REJECTED">已驳回</SelectItem>
                <SelectItem value="all">全部状态</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-10" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-0">客户</TableHead>
                <TableHead className="w-[170px]">提交时间</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="min-w-0">申请说明</TableHead>
                <TableHead className="w-[130px]">提交 IP</TableHead>
                <TableHead className="w-[150px]">处理</TableHead>
                <TableHead className="sticky-col-right w-[140px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={<KeyRound className="h-6 w-6" />}
                      title="暂无找回密码申请"
                      description="客户在前台提交「找回密码」申请后会出现在这里"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-0">
                      <CellPair
                        primary={row.user?.name ?? "（用户已删除）"}
                        secondary={row.email}
                      />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} labelMap={{ ...STATUS_LABELS }} />
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                      <CellText value={row.note || "-"} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {row.ip || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.handledAt ? (
                        <>
                          {row.handledByName ?? "—"}
                          <br />
                          <span className="tabular-nums">{formatDateTime(row.handledAt)}</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <div className="flex justify-end">
                        <DataTableActions
                          actions={[
                            {
                              label: "查看详情",
                              icon: Eye,
                              onClick: () => {
                                setDetail(row);
                                setRejectNote("");
                                setDetailOpen(true);
                              },
                              primary: true,
                            },
                          ]}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-end"
      />

      {/* 详情 + 处理 */}
      <AdminDrawer open={detailOpen} onOpenChange={setDetailOpen}>
        <AdminDrawerHeader
          title={detail ? `找回密码申请：${detail.user?.name ?? detail.email}` : "找回密码申请"}
          description={detail?.email}
        />
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {detail ? (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">申请信息</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                  <div className="text-muted-foreground">客户</div>
                  <div>{detail.user?.name ?? "（用户已删除）"}</div>
                  <div className="text-muted-foreground">邮箱</div>
                  <div className="break-all">{detail.email}</div>
                  <div className="text-muted-foreground">状态</div>
                  <div>
                    <StatusBadge status={detail.status} labelMap={{ ...STATUS_LABELS }} />
                  </div>
                  <div className="text-muted-foreground">提交时间</div>
                  <div className="tabular-nums">{formatDateTime(detail.createdAt)}</div>
                  <div className="text-muted-foreground">提交 IP</div>
                  <div className="font-mono text-xs">{detail.ip || "-"}</div>
                  <div className="text-muted-foreground">申请说明</div>
                  <div className="break-words">{detail.note || "（未填写）"}</div>
                  <div className="text-muted-foreground">处理人</div>
                  <div>
                    {detail.handledByName ?? "-"}
                    {detail.handledAt ? (
                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(detail.handledAt)}
                      </span>
                    ) : null}
                  </div>
                  {detail.rejectReason ? (
                    <>
                      <div className="text-muted-foreground">驳回原因</div>
                      <div className="break-words">{detail.rejectReason}</div>
                    </>
                  ) : null}
                </div>
              </section>

              {detail.status === "PENDING" ? (
                <section className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                  <h3 className="text-sm font-semibold text-destructive">处理申请</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    批准：系统生成强随机临时密码并邮件发送给客户，该账号全部会话立即失效，
                    客户首次登录被强制修改密码。驳回：账号密码不变，原因随邮件告知客户。
                  </p>
                  <Textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="驳回原因（可选，会随邮件发送给客户）"
                    rows={2}
                    maxLength={500}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === detail.id}
                      onClick={() => void approve(detail)}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      批准并下发临时密码
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === detail.id}
                      onClick={() => void reject(detail)}
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      驳回申请
                    </Button>
                  </div>
                </section>
              ) : (
                <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  该申请已于 {formatDateTime(detail.handledAt)} 处理完毕，无需再次操作。
                </p>
              )}
            </>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      </AdminDrawer>

      {/* 批准后的一次性明文临时密码 */}
      <Dialog open={issued !== null} onOpenChange={(open) => !open && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>临时密码已生成</DialogTitle>
            <DialogDescription>
              {issued?.mailConfigured
                ? `临时密码已发送至 ${issued?.email}。以下明文仅本次显示一次（数据库只存哈希），请勿截图外传。`
                : `邮件服务未配置，系统无法自动送达。请将以下临时密码通过其他安全渠道转达给 ${issued?.email}。此明文仅本次显示一次。`}
            </DialogDescription>
          </DialogHeader>
          <div className="my-2 rounded-md border border-dashed bg-muted/40 px-4 py-3 text-center">
            <p
              data-testid="temp-password-value"
              className="font-mono text-xl font-semibold tracking-widest"
            >
              {issued?.tempPassword}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            客户首次登录后必须立即修改密码，修改成功后该临时密码立即失效。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => void copyTemp(issued?.tempPassword ?? "")}>
              复制
            </Button>
            <Button onClick={() => setIssued(null)}>我已记录</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

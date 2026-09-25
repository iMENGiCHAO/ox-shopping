"use client";

import * as React from "react";
import { BadgeCheck, Banknote, Eye, RefreshCw, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminDrawer, AdminDrawerHeader } from "@/components/admin/admin-drawer";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { CellPair, CellText } from "@/components/admin/cell-text";
import { useT } from "@/components/admin/lang-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminPagination } from "@/components/admin/types";
import {
  WITHDRAW_STATUS_LABELS,
  WITHDRAW_STATUS_TABS,
  WITHDRAW_STATUS_VARIANTS,
  formatDateTime,
} from "../_shared";
import { formatMoney } from "@/lib/utils";

const PAGE_SIZE = 10;
const COL_COUNT = 7;

type StatusFilter = "all" | "PENDING" | "APPROVED" | "PAID" | "REJECTED";

interface WithdrawRow {
  id: string;
  amount: number;
  /** 提现币种（账户结算币种的申请时快照；amount 按此币种计价） */
  currency: string;
  status: "PENDING" | "APPROVED" | "PAID" | "REJECTED";
  /** 收款账户：平台侧不脱敏，打款要照抄 */
  accountInfo: string | null;
  payeeName: string | null;
  payeeMethod: string | null;
  /** 申请人填写的申请备注 */
  remark: string | null;
  auditNote: string | null;
  payNote: string | null;
  createdAt: string;
  auditedAt: string | null;
  paidAt: string | null;
  userName: string;
  userEmail: string;
}

interface WithdrawsResponse {
  data: WithdrawRow[];
  pagination: AdminPagination;
  counts: Record<string, number>;
}

/**
 * 提现审核。
 *
 * 状态机是单向的：PENDING →（approve）→ APPROVED →（paid）→ PAID，
 * 以及 PENDING/APPROVED →（reject）→ REJECTED；服务端用条件更新做状态抢占，
 * 因此这里的按钮只按当前状态给建议入口，真正的并发保护在服务端（冲突会报错回显）。
 *
 * 三个动作都会**动钱**（冻结核销 / 解冻退回余额），一律二次确认并把后果写在确认框里。
 */
export default function AdminWithdrawalsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<WithdrawRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("PENDING");
  const [counts, setCounts] = React.useState<Record<string, number>>({
    PENDING: 0,
    APPROVED: 0,
    PAID: 0,
    REJECTED: 0,
  });

  const [detail, setDetail] = React.useState<WithdrawRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [payNote, setPayNote] = React.useState("");

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (statusFilter !== "all") params.set("status", statusFilter);
    setLoading(true);
    try {
      const res = await apiFetch<WithdrawsResponse>(
        `/api/admin/distribution/withdrawals?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotalPages(res.pagination?.totalPages ?? 1);
      setCounts({
        PENDING: 0,
        APPROVED: 0,
        PAID: 0,
        REJECTED: 0,
        ...(res.counts ?? {}),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("加载提现申请失败"));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openDetail = (row: WithdrawRow) => {
    setDetail(row);
    setNote(row.auditNote ?? "");
    setPayNote(row.payNote ?? "");
    setDetailOpen(true);
  };

  const submit = async (row: WithdrawRow, action: "approve" | "paid" | "reject"): Promise<void> => {
    const name = row.userName || row.userEmail;
    const amountText = formatMoney(row.amount, row.currency);

    const confirms: Record<typeof action, string> = {
      approve:
        `确认通过 ${name} 的提现申请 ${amountText}？\n\n` +
        `· 状态变为「已通过（待打款）」\n` +
        `· 金额仍处于冻结中，尚未从平台余额扣除\n` +
        `· 线下打款完成后还需再点「标记已打款」核销`,
      paid:
        `确认 ${name} 的提现 ${amountText} 已实际打款？\n\n` +
        `· 状态变为「已打款」，冻结金额正式核销\n` +
        `· 请务必先完成线下转账再点，误点需人工调账`,
      reject:
        `确认驳回 ${name} 的提现申请 ${amountText}？\n\n` +
        `· 状态变为「已驳回」\n` +
        `· 冻结金额立即解冻，退回申请人的可提现余额`,
    };
    if (!window.confirm(confirms[action])) return;

    setBusy(true);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "paid" && payNote.trim()) body.payNote = payNote.trim();
      if (action !== "paid" && note.trim()) body.note = note.trim();
      const res = await apiFetch<{ ok: boolean; status: string }>(
        `/api/admin/distribution/withdrawals/${row.id}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      toast.success(
        `已处理，当前状态：${(WITHDRAW_STATUS_LABELS as Record<string, string>)[res.status] ?? res.status}`,
      );
      setDetailOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("处理提现失败"));
    } finally {
      setBusy(false);
    }
  };

  const totalAll = WITHDRAW_STATUS_TABS.reduce((sum, key) => sum + (counts[key] ?? 0), 0);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("提现审核")}
        description={t(
          "审核分销商的提现申请：通过 → 线下打款 → 标记已打款核销；驳回会把冻结金额解冻退回余额",
        )}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("刷新")}
          </Button>
        }
      />

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">
            {t("全部")}（{totalAll}）
          </TabsTrigger>
          {WITHDRAW_STATUS_TABS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {WITHDRAW_STATUS_LABELS[key]}（{counts[key] ?? 0}）
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-0">{t("申请人")}</TableHead>
                <TableHead className="w-[120px] text-right">{t("金额")}</TableHead>
                <TableHead className="min-w-0">{t("收款账户")}</TableHead>
                <TableHead className="min-w-0">{t("收款人 / 方式")}</TableHead>
                <TableHead className="min-w-0">{t("申请备注")}</TableHead>
                <TableHead className="w-[90px]">{t("Status")}</TableHead>
                <TableHead className="w-[170px]">{t("申请时间")}</TableHead>
                <TableHead className="sticky-col-right w-[120px] text-right">
                  {t("Actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: COL_COUNT }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COL_COUNT} className="p-0">
                    <EmptyState
                      icon={<Wallet className="h-6 w-6" />}
                      title={t("没有该状态的提现申请")}
                      description={t("分销商在前台「我的分销」提交提现后会出现在这里")}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-0">
                      <CellPair primary={row.userName} secondary={row.userEmail} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.amount, row.currency)}
                    </TableCell>
                    <TableCell className="min-w-0">
                      <CellText value={row.accountInfo || "-"} className="text-xs" />
                      <CellText
                        value={
                          row.payeeName
                            ? `${row.payeeName} · ${row.payeeMethod ?? "-"}`
                            : t("（未填写实名）")
                        }
                        className="text-xs"
                      />
                    </TableCell>
                    <TableCell className="min-w-0">
                      <CellText
                        value={row.remark || "-"}
                        className="text-xs text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.status}
                        labelMap={{ ...WITHDRAW_STATUS_LABELS }}
                        variantMap={{ ...WITHDRAW_STATUS_VARIANTS }}
                      />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <DataTableActions
                        actions={[
                          {
                            label: t("处理"),
                            icon: Eye,
                            primary: true,
                            onClick: () => openDetail(row),
                          },
                        ]}
                      />
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

      <AdminDrawer open={detailOpen} onOpenChange={setDetailOpen}>
        <AdminDrawerHeader
          title={detail ? `${t("提现审核")}：${detail.userName}` : t("提现审核")}
          description={detail?.userEmail}
        />
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {detail ? (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("申请信息")}</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                  <div className="text-muted-foreground">{t("申请人")}</div>
                  <div className="break-all">{detail.userName}</div>
                  <div className="text-muted-foreground">{t("Email")}</div>
                  <div className="break-all">{detail.userEmail}</div>
                  <div className="text-muted-foreground">{t("金额")}</div>
                  <div className="font-medium tabular-nums">{formatMoney(detail.amount, detail.currency)}</div>
                  <div className="text-muted-foreground">{t("收款账户")}</div>
                  <div className="break-all">{detail.accountInfo || t("（未填写）")}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("收款人：")}
                    {detail.payeeName || t("（未填写实名）")} · {t("方式：")}
                    {detail.payeeMethod || "-"}
                  </div>
                  <div className="text-muted-foreground">{t("申请备注")}</div>
                  <div className="break-words">{detail.remark || t("（未填写）")}</div>
                  <div className="text-muted-foreground">{t("Status")}</div>
                  <div>
                    <StatusBadge
                      status={detail.status}
                      labelMap={{ ...WITHDRAW_STATUS_LABELS }}
                      variantMap={{ ...WITHDRAW_STATUS_VARIANTS }}
                    />
                  </div>
                  <div className="text-muted-foreground">{t("申请时间")}</div>
                  <div className="tabular-nums">{formatDateTime(detail.createdAt)}</div>
                  <div className="text-muted-foreground">{t("审核时间")}</div>
                  <div className="tabular-nums">{formatDateTime(detail.auditedAt)}</div>
                  <div className="text-muted-foreground">{t("打款时间")}</div>
                  <div className="tabular-nums">{formatDateTime(detail.paidAt)}</div>
                  <div className="text-muted-foreground">{t("Review Notes")}</div>
                  <div className="break-words">{detail.auditNote || "-"}</div>
                  <div className="text-muted-foreground">{t("打款凭证号")}</div>
                  <div className="break-all font-mono text-xs">{detail.payNote || "-"}</div>
                </div>
              </section>

              {detail.status === "PAID" || detail.status === "REJECTED" ? (
                <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  {detail.status === "PAID"
                    ? t("该提现单已打款核销，无需再次操作。")
                    : t("该提现单已驳回并解冻，无需再次操作。")}
                </p>
              ) : (
                <section className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                  <h3 className="text-sm font-semibold text-destructive">{t("处理提现")}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t(
                      "通过：仅改变状态，金额仍在冻结中；标记已打款：核销冻结，请先完成线下转账；驳回：冻结金额立即解冻并退回申请人余额。",
                    )}
                  </p>

                  {detail.status === "PENDING" ? (
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("审核备注（可选，仅供后台留档）")}
                      rows={2}
                      maxLength={300}
                    />
                  ) : null}

                  {detail.status === "APPROVED" ? (
                    <div className="space-y-2">
                      <Input
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                        placeholder={t("打款凭证号（可选，如银行流水号 / 转账单号）")}
                        maxLength={120}
                        className="font-mono"
                      />
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("驳回原因（仅在驳回时使用，会留档）")}
                        rows={2}
                        maxLength={300}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {detail.status === "PENDING" ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void submit(detail, "approve")}
                      >
                        <BadgeCheck className="mr-1.5 h-4 w-4" />
                        {t("通过审核")}
                      </Button>
                    ) : null}
                    {detail.status === "APPROVED" ? (
                      <Button size="sm" disabled={busy} onClick={() => void submit(detail, "paid")}>
                        <Banknote className="mr-1.5 h-4 w-4" />
                        {t("标记已打款")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void submit(detail, "reject")}
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      {t("Reject request")}
                    </Button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </div>
      </AdminDrawer>
    </div>
  );
}

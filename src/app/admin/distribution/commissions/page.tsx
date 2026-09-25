"use client";

import * as React from "react";
import { Coins, Download, RefreshCw, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CellText } from "@/components/admin/cell-text";
import { useT } from "@/components/admin/lang-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import type { AdminListResult } from "@/components/admin/types";
import {
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_VARIANTS,
  formatCny,
  formatDateTime,
  formatPercent,
} from "../_shared";

const PAGE_SIZE = 20;
const COL_COUNT = 12;

type StatusFilter = "PENDING" | "SETTLED" | "REVERSED" | "all";

interface CommissionLogRow {
  id: string;
  orderNumber: string;
  /** 下单人：服务端已拼成「昵称（脱敏邮箱）」 */
  fromUser: string;
  /** 受益人：服务端已拼成「昵称（脱敏邮箱）」 */
  toUser: string;
  level: number;
  ratio: number;
  amount: number;
  amountCny: number;
  /** 结算币种与按其折算的金额（账户入账口径） */
  settleCurrency: string;
  amountSettle: number;
  currency: string;
  status: "PENDING" | "SETTLED" | "REVERSED";
  createdAt: string;
  settledAt: string | null;
  reversedAt: string | null;
}

/**
 * 全平台佣金流水（只读）。
 *
 * 这里刻意不提供任何改单入口：佣金的产生/结算/冲正全部由订单事件与对账补偿驱动，
 * 手工改一条流水会让「订单 — 归属 — 佣金」三方对不上账；要修数据请走对账或解绑。
 */
export default function AdminCommissionsPage() {
  const t = useT();

  const [rows, setRows] = React.useState<CommissionLogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  // 人工冲正弹窗（P1-8）：金额留空=全额，原因必填
  const [reverseTarget, setReverseTarget] = React.useState<CommissionLogRow | null>(null);
  const [reverseAmount, setReverseAmount] = React.useState("");
  const [reverseNote, setReverseNote] = React.useState("");
  const [reversing, setReversing] = React.useState(false);
  const [orderNumber, setOrderNumber] = React.useState("");
  const [debouncedOrder, setDebouncedOrder] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedOrder(orderNumber.trim()), 400);
    return () => clearTimeout(timer);
  }, [orderNumber]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedOrder, statusFilter]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedOrder) params.set("orderNumber", debouncedOrder);
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<CommissionLogRow>>(
        `/api/admin/distribution/commissions?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("加载佣金流水失败"));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedOrder, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** 人工冲正：金额留空=全额；服务端做增量 + CAS，幂等且并发安全 */
  const submitReverse = async () => {
    if (!reverseTarget) return;
    if (reverseNote.trim().length < 2) {
      toast.error(t("请填写冲正原因（至少 2 个字）—— 资金动作必须留痕"));
      return;
    }
    setReversing(true);
    try {
      const amount = reverseAmount.trim() === "" ? null : Number(reverseAmount);
      if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
        toast.error(t("冲正金额需为大于 0 的数字（留空表示全额冲正）"));
        return;
      }
      const res = await apiFetch<{ reversedAmount: number; fullReversed: boolean }>(
        `/api/admin/distribution/commissions/${reverseTarget.id}/reverse`,
        { method: "POST", body: JSON.stringify({ amount, note: reverseNote.trim() }) },
      );
      toast.success(
        res.fullReversed
          ? t("已全额冲正该笔佣金")
          : `已冲正 ${formatMoney(res.reversedAmount, reverseTarget.currency)}`,
      );
      setReverseTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("冲正失败"));
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("佣金流水")}
        description={t(
          "每一笔佣金对应「某订单的某一层级」；金额同时给出原币与折合人民币。自动冲正来自退款/取消，人工冲正用于刷单认定、客服赔付等场景（必填原因）",
        )}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams();
              if (statusFilter !== "all") params.set("status", statusFilter);
              if (debouncedOrder) params.set("orderNumber", debouncedOrder);
              // 走浏览器下载：接口已带 Content-Disposition，无需前端拼 CSV
              window.open(
                `/api/admin/distribution/commissions/export${params.size ? `?${params}` : ""}`,
                "_blank",
              );
            }}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t("导出 CSV")}
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder={t("搜索订单号")}
              className="h-10 w-64 pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-36" aria-label={t("按状态筛选")}>
              <SelectValue placeholder={t("All statuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All statuses")}</SelectItem>
              <SelectItem value="PENDING">{t("待结算")}</SelectItem>
              <SelectItem value="SETTLED">{t("已结算")}</SelectItem>
              <SelectItem value="REVERSED">{t("已冲正")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-10" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {t("刷新")}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            {t("共")} <span className="tabular-nums">{total}</span> {t("条")}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">{t("Order #")}</TableHead>
                <TableHead className="min-w-0">{t("下单人")}</TableHead>
                <TableHead className="min-w-0">{t("受益人")}</TableHead>
                <TableHead className="w-[70px]">{t("层级")}</TableHead>
                <TableHead className="w-[80px] text-right">{t("比例")}</TableHead>
                <TableHead className="w-[130px] text-right">{t("佣金（原币）")}</TableHead>
                <TableHead className="w-[130px] text-right">{t("结算金额（入账币种）")}</TableHead>
                <TableHead className="w-[120px] text-right">{t("折合 CNY")}</TableHead>
                <TableHead className="w-[90px]">{t("Status")}</TableHead>
                <TableHead className="w-[160px]">{t("时间")}</TableHead>
                <TableHead className="w-[170px]">{t("结算 / 冲正")}</TableHead>
                <TableHead className="w-[110px] text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
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
                      icon={<Coins className="h-6 w-6" />}
                      title={t("暂无佣金流水")}
                      description={t("订单支付并产生推广归属后，佣金流水会出现在这里")}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
                    <TableCell className="min-w-0">
                      <CellText value={row.fromUser} className="text-sm" />
                    </TableCell>
                    <TableCell className="min-w-0">
                      <CellText value={row.toUser} className="text-sm" />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{row.level}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatPercent(row.ratio)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatMoney(row.amount, row.currency)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatMoney(row.amountSettle, row.settleCurrency)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {formatCny(row.amountCny)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={row.status}
                        labelMap={{ ...COMMISSION_STATUS_LABELS }}
                        variantMap={{ ...COMMISSION_STATUS_VARIANTS }}
                      />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {row.settledAt ? (
                        <div>
                          {t("结算")} {formatDateTime(row.settledAt)}
                        </div>
                      ) : null}
                      {row.reversedAt ? (
                        <div>
                          {t("冲正")} {formatDateTime(row.reversedAt)}
                        </div>
                      ) : null}
                      {!row.settledAt && !row.reversedAt ? "-" : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={row.status === "REVERSED"}
                        onClick={() => {
                          setReverseTarget(row);
                          setReverseAmount("");
                          setReverseNote("");
                        }}
                      >
                        <Undo2 className="mr-1 h-3.5 w-3.5" />
                        {t("冲正")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("人工冲正佣金")}</DialogTitle>
            <DialogDescription>
              {t(
                "用于刷单认定、客服赔付、错单纠正等自动冲正覆盖不到的场景。已结算的部分会按金额从可提现余额扣回（可为负=挂账）；受益人已注销时只改流水、不动账户。",
              )}
            </DialogDescription>
          </DialogHeader>
          {reverseTarget ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
                <div>
                  {t("订单：")}
                  {reverseTarget.orderNumber}
                </div>
                <div>
                  {t("受益人：")}
                  {reverseTarget.toUser}
                </div>
                <div>
                  {t("本笔佣金：")}
                  {formatMoney(reverseTarget.amount, reverseTarget.currency)}（
                  {formatCny(reverseTarget.amountCny)}） · {t("Status")} {reverseTarget.status}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reverse-amount">{t("冲正金额（订单币种，留空=全额）")}</Label>
                <Input
                  id="reverse-amount"
                  inputMode="decimal"
                  value={reverseAmount}
                  onChange={(e) => setReverseAmount(e.target.value)}
                  placeholder={String(reverseTarget.amount)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reverse-note">{t("冲正原因（必填）")}</Label>
                <Input
                  id="reverse-note"
                  value={reverseNote}
                  onChange={(e) => setReverseNote(e.target.value)}
                  placeholder={t("例如：刷单认定，运营复核后冲正")}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void submitReverse()} disabled={reversing}>
              {reversing ? t("提交中…") : t("确认冲正")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="justify-end"
      />
    </div>
  );
}

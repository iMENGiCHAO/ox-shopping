"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useShopLang, useT } from "@/components/shop/lang-provider";
import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import type { DistributionAccountSummary } from "@/lib/distribution/contract";
import type { Paginated, PaginationMeta, WithdrawRow } from "@/components/shop/distribution/types";
import { cny, formatDateTime } from "@/components/shop/distribution/format";
import { StatCard, TableSkeleton, WithdrawStatusBadge } from "@/components/shop/distribution/ui";

const PAGE_SIZE = 10;

const EMPTY_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

interface AccountResponse {
  account: DistributionAccountSummary;
  minWithdrawAmount: number;
}

/**
 * 提现管理。
 *
 * 前端只做「帮用户少犯错」的校验（最低额、余额上限）；真正的资金安全靠服务端
 * 条件更新扣余额 + 在途单唯一，前端校验被绕过也不会超发。
 */
export default function DistributionWithdrawalsPage() {
  const t = useT();
  const { lang } = useShopLang();
  const [account, setAccount] = useState<DistributionAccountSummary | null>(null);
  const [minWithdrawAmount, setMinWithdrawAmount] = useState(0);
  const [rows, setRows] = useState<WithdrawRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [accountInfo, setAccountInfo] = useState("");
  const [remark, setRemark] = useState("");
  // KYC：一期线下打款必须能核对到人（收款人实名 + 收款方式为必填）
  const [payeeName, setPayeeName] = useState("");
  const [payeeMethod, setPayeeMethod] = useState<"bank" | "alipay" | "wechat" | "other">("alipay");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadAccount = useCallback(async () => {
    try {
      const res = await apiFetch<AccountResponse>("/api/distribution/my/account");
      setAccount(res.account);
      setMinWithdrawAmount(res.minWithdrawAmount);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    }
  }, [t]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      const res = await apiFetchRaw<Paginated<WithdrawRow>>(
        `/api/distribution/my/withdrawals?${qs.toString()}`,
      );
      setRows(res.data ?? []);
      setPagination(res.pagination ?? EMPTY_PAGINATION);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Load failed"));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error(t("Enter an amount"));
      return;
    }
    if (value < minWithdrawAmount) {
      toast.error(t("Amount must be at least {amount}", { amount: cny(minWithdrawAmount) }));
      return;
    }
    if (account && value > account.balance) {
      toast.error(t("Amount exceeds your available balance"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/distribution/withdraw", {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          payeeName: payeeName.trim(),
          payeeMethod,
          acceptTerms: true as const,
          ...(accountInfo.trim() ? { accountInfo: accountInfo.trim() } : {}),
          ...(remark.trim() ? { remark: remark.trim() } : {}),
        }),
      });
      toast.success(t("Withdrawal request submitted"));
      setAmount("");
      setAccountInfo("");
      setRemark("");
      setAcceptTerms(false);
      setPage(1);
      await Promise.all([loadAccount(), loadRows()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Operation failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("Withdrawals")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("Request a payout and track its status.")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("Available balance")} value={cny(account?.balance ?? 0)} />
        <StatCard label={t("Frozen")} value={cny(account?.frozen ?? 0)} />
        <StatCard label={t("Pending commission")} value={cny(account?.pendingCommission ?? 0)} />
        <StatCard label={t("Minimum withdrawal")} value={cny(minWithdrawAmount)} />
      </div>

      <Card className="panel">
        <CardHeader>
          <CardTitle>{t("Request a withdrawal")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-amount">{t("Amount")}</Label>
              <Input
                id="withdraw-amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                {t("Minimum withdrawal: {amount}", { amount: cny(minWithdrawAmount) })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-account">
                {t("Payout account")}{" "}
                <span className="text-muted-foreground">({t("Optional")})</span>
              </Label>
              <Input
                id="withdraw-account"
                value={accountInfo}
                onChange={(e) => setAccountInfo(e.target.value)}
                placeholder={t("Alipay account or bank card number")}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-payee-name">
                {t("Payee legal name")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="withdraw-payee-name"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                placeholder={t("Must match the receiving account holder")}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-payee-method">
                {t("Payout method")} <span className="text-destructive">*</span>
              </Label>
              <select
                id="withdraw-payee-method"
                className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={payeeMethod}
                onChange={(e) =>
                  setPayeeMethod(e.target.value as "bank" | "alipay" | "wechat" | "other")
                }
              >
                <option value="alipay">{t("Alipay")}</option>
                <option value="wechat">{t("WeChat Pay")}</option>
                <option value="bank">{t("Bank transfer")}</option>
                <option value="other">{t("Other")}</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="withdraw-remark">
                {t("Remark")} <span className="text-muted-foreground">({t("Optional")})</span>
              </Label>
              <Input
                id="withdraw-remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="h-10"
              />
            </div>
            <label className="flex items-start gap-2.5 rounded-md border border-border p-3 text-[13px] sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span>
                {t("I have read and agree to the")}{" "}
                <Link href="/distribution/rules" target="_blank" className="underline underline-offset-4">
                  {t("How it works")}
                </Link>
                {t("— commission, settlement and withdrawal rules.")}
              </span>
            </label>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={submitting || !account || !acceptTerms || payeeName.trim().length < 2}
              >
                {submitting ? t("Submitting") : t("Submit request")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <h3 className="mb-3 text-sm font-medium">{t("My withdrawal records")}</h3>
        {loading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title={t("No withdrawal records yet.")}
            description={t("Request a payout and track its status.")}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t("Amount")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead>{t("Account (masked)")}</TableHead>
                  <TableHead>{t("Requested at")}</TableHead>
                  <TableHead>{t("Reviewed at")}</TableHead>
                  <TableHead>{t("Paid at")}</TableHead>
                  <TableHead>{t("Remark")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-right text-sm tabular-nums">
                      {cny(row.amount)}
                    </TableCell>
                    <TableCell>
                      <WithdrawStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="truncate text-sm">{row.accountInfo || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.createdAt, lang)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.auditedAt, lang)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.paidAt, lang)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <p>{row.remark || "-"}</p>
                      {row.auditNote ? (
                        <p className="mt-0.5">
                          {t("Review note")}: {row.auditNote}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}

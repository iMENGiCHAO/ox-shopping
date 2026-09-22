"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Network, RefreshCw, Search, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { CellPair } from "@/components/admin/cell-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminListResult } from "@/components/admin/types";
import { formatCny, formatDateTime } from "../_shared";

const PAGE_SIZE = 10;
const COL_COUNT = 10;

interface DistributorRow {
  id: string;
  name: string | null;
  email: string;
  referralCode: string | null;
  distLevel: number;
  firstPromoteAt: string | null;
  customerCount: number;
  teamCount: number;
  balance: number;
  totalCommission: number;
  /** 分销商等级（0=普通）；等级命中 `commission_rules.tierLevel` 的差异化比例 */
  tier: number;
}

/**
 * 分销商列表。
 *
 * 分销商身份是**首次成功推广后自动升级**的（见 distributors 路由注释），
 * 所以这里没有「审核/取消分销商」入口 —— 页面只做查询与跳转关系链。
 */
export default function AdminDistributorsPage() {
  const router = useRouter();

  const [rows, setRows] = React.useState<DistributorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  /* P2-15 分销商等级：等级命中 commission_rules.tierLevel 的差异化比例，
     只影响之后产生的佣金（历史流水按当时规则快照保留，不回算）。 */
  const [tierTarget, setTierTarget] = React.useState<DistributorRow | null>(null);
  const [tierValue, setTierValue] = React.useState("0");
  const [tierNote, setTierNote] = React.useState("");
  const [savingTier, setSavingTier] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const load = React.useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("q", debouncedSearch);
    setLoading(true);
    try {
      const res = await apiFetchRaw<AdminListResult<DistributorRow>>(
        `/api/admin/distribution/distributors?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载分销商列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submitTier = async () => {
    if (!tierTarget) return;
    const tier = Number(tierValue);
    if (!Number.isInteger(tier) || tier < 0 || tier > 10) {
      toast.error("等级需为 0 ~ 10 的整数（0=普通）");
      return;
    }
    setSavingTier(true);
    try {
      await apiFetch(`/api/admin/distribution/distributors/${tierTarget.id}/tier`, {
        method: "POST",
        body: JSON.stringify({ tier, ...(tierNote.trim() ? { note: tierNote.trim() } : {}) }),
      });
      toast.success(`已将 ${tierTarget.name ?? tierTarget.email} 的等级设为 ${tier}`);
      setTierTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "设置等级失败");
    } finally {
      setSavingTier(false);
    }
  };


  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="分销商"
        description="已产生过推广归属的分销商；「关系链」可查看其上级、绑定与邀请明细"
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索昵称 / 邮箱 / 推广码"
              className="h-10 w-72 pl-8"
            />
          </div>
          <Button variant="outline" size="sm" className="h-10" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            共 <span className="tabular-nums">{total}</span> 位分销商
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-0">用户</TableHead>
                <TableHead className="w-[120px]">推广码</TableHead>
                <TableHead className="w-[80px]">层级</TableHead>
                <TableHead className="w-[170px]">首次推广时间</TableHead>
                <TableHead className="w-[110px] text-right">直接客户数</TableHead>
                <TableHead className="w-[100px] text-right">团队人数</TableHead>
                <TableHead className="w-[130px] text-right">可提现余额</TableHead>
                <TableHead className="w-[130px] text-right">累计佣金</TableHead>
                <TableHead className="w-[90px]">等级</TableHead>
                <TableHead className="sticky-col-right w-[140px] text-right">操作</TableHead>
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
                      icon={<Share2 className="h-6 w-6" />}
                      title="暂无分销商"
                      description="客户通过推广链接/推广码成功下单后会自动成为分销商"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-0">
                      <CellPair primary={row.name ?? "（未设置昵称）"} secondary={row.email} />
                    </TableCell>
                    <TableCell>
                      {row.referralCode ? (
                        <Badge variant="secondary" className="font-mono">
                          {row.referralCode}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{row.distLevel}</TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(row.firstPromoteAt)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.customerCount}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {row.teamCount}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCny(row.balance)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCny(row.totalCommission)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {row.tier > 0 ? (
                        <Badge variant="secondary">VIP {row.tier}</Badge>
                      ) : (
                        <span className="text-muted-foreground">普通</span>
                      )}
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <DataTableActions
                        actions={[
                          {
                            label: "设等级",
                            icon: Sparkles,
                            primary: true,
                            onClick: () => {
                              setTierTarget(row);
                              setTierValue(String(row.tier ?? 0));
                              setTierNote("");
                            },
                          },
                          {
                            label: "查看关系链",
                            icon: Network,
                            onClick: () =>
                              router.push(`/admin/distribution/relations?userId=${row.id}`),
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


      <Dialog open={!!tierTarget} onOpenChange={(o) => !o && setTierTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置分销商等级</DialogTitle>
            <DialogDescription>
              等级命中「佣金规则」里 `tierLevel` 相同的规则（同作用域内**等级专用优先于通用**）。
              改等级**只影响之后的订单**：历史佣金流水按当时的规则快照保留，不回算。
            </DialogDescription>
          </DialogHeader>
          {tierTarget ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
                <div>{tierTarget.name ?? "-"}（{tierTarget.email}）</div>
                <div>当前等级：{tierTarget.tier > 0 ? `VIP ${tierTarget.tier}` : "普通"}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tier-value">等级（0 = 普通，1 ~ 10 越高越优）</Label>
                <Input
                  id="tier-value"
                  inputMode="numeric"
                  value={tierValue}
                  onChange={(e) => setTierValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tier-note">调整原因（可选）</Label>
                <Input
                  id="tier-note"
                  value={tierNote}
                  onChange={(e) => setTierNote(e.target.value)}
                  placeholder="例如：季度业绩达标"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTierTarget(null)}>
              取消
            </Button>
            <Button onClick={() => void submitTier()} disabled={savingTier}>
              {savingTier ? "保存中…" : "保存等级"}
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

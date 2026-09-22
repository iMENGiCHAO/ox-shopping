"use client";

import * as React from "react";
import { Link2, Network, RefreshCw, Search, Share2, Unlink, UserRound } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard, formatDateTime } from "../_shared";

interface RelationsPayload {
  user: {
    id: string;
    name: string;
    email: string;
    isDistributor: boolean;
    distLevel: number;
    referralCode: string | null;
  } | null;
  ancestors: { userId: string; name: string; email: string; depth: number }[];
  directCount: number;
  teamCount: number;
  bind: {
    id: string;
    distributorId: string;
    distributorName: string;
    bindTime: string;
    source: string | null;
  } | null;
  invitees: { id: string; name: string; email: string; isDistributor: boolean }[];
}

interface RelationsResponse {
  found: boolean;
  relations: RelationsPayload | null;
}

type QueryParam = { userId: string } | { q: string };

/**
 * 关系链查询。
 *
 * 两个入口共用一份结果：URL 上的 `?userId=`（分销商列表点「查看关系链」跳过来）与
 * 输入框的邮箱/推广码（后端两种都认，前端不猜格式，统一走 `q`）。
 * 因此这里不把查询条件写进 URL —— 从列表跳进来是「看某个人」，
 * 而手动搜索是「找人」，后者再改 URL 会污染浏览器历史。
 */
export default function AdminRelationsPage() {
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [relations, setRelations] = React.useState<RelationsPayload | null>(null);
  const [lastParam, setLastParam] = React.useState<QueryParam | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(async (param: QueryParam) => {
    const params = new URLSearchParams(
      "userId" in param ? { userId: param.userId } : { q: param.q },
    );
    setLoading(true);
    setLastParam(param);
    try {
      const res = await apiFetch<RelationsResponse>(
        `/api/admin/distribution/relations?${params.toString()}`,
      );
      setRelations(res.relations ?? null);
      setSearched(true);
    } catch (err) {
      setRelations(null);
      setSearched(true);
      toast.error(err instanceof Error ? err.message : "查询关系链失败");
    } finally {
      setLoading(false);
    }
  }, []);

  // 从分销商列表跳进来时带 ?userId=，首屏直接出结果，省一次手动查询
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const userId = sp.get("userId");
    const q = sp.get("q");
    if (userId) {
      void run({ userId });
    } else if (q) {
      setQuery(q);
      void run({ q });
    }
  }, [run]);

  const search = () => {
    const q = query.trim();
    if (!q) {
      toast.error("请输入邮箱或推广码");
      return;
    }
    void run({ q });
  };

  const unbind = async () => {
    if (!relations?.bind) return;
    const bind = relations.bind;
    const who = relations.user?.name ?? relations.user?.email ?? "该客户";
    if (
      !window.confirm(
        `确认解除 ${who} 与上级「${bind.distributorName}」的绑定？\n\n` +
          `· 仅解除当前归属，历史订单已固化的佣金不受影响\n` +
          `· 解绑后该客户可被其它推广链接重新归属（若策略允许）`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/admin/distribution/unbind", {
        method: "POST",
        body: JSON.stringify({ bindId: bind.id, note: "管理员在关系链页解绑" }),
      });
      toast.success("已解除绑定");
      if (lastParam) await run(lastParam);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解绑失败");
    } finally {
      setBusy(false);
    }
  };

  const user = relations?.user ?? null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="关系链"
        description="按邮箱或推广码查询某人的分销身份、上级链与团队规模；也支持 URL 直接带 ?userId= 查询"
        actions={
          <Button
            variant="outline"
            onClick={() => lastParam && void run(lastParam)}
            disabled={!lastParam || loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            刷新
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search();
              }}
              placeholder="输入邮箱或推广码"
              className="h-10 w-80 pl-8"
            />
          </div>
          <Button className="h-10" onClick={search} disabled={loading}>
            <Search className="h-4 w-4" />
            查询
          </Button>
        </CardContent>
      </Card>

      {loading && !relations ? (
        <Skeleton className="h-64 w-full" />
      ) : !searched ? (
        <EmptyState
          icon={<Network className="h-6 w-6" />}
          title="输入邮箱或推广码开始查询"
          description="邮箱不区分大小写；推广码请填完整编码（如 A1B2C3）"
        />
      ) : !user ? (
        <EmptyState
          icon={<UserRound className="h-6 w-6" />}
          title="查不到该用户"
          description="没有匹配的邮箱或推广码。确认推广码是否填全，或从「分销商」列表点「查看关系链」进入"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="分销身份"
              value={user.isDistributor ? "分销商" : "普通客户"}
              icon={Share2}
              tone={user.isDistributor ? "info" : "default"}
            />
            <StatCard label="当前层级" value={user.distLevel} icon={Network} hint="1 = 最上层" />
            <StatCard label="直接下级数" value={relations?.directCount ?? 0} icon={UserRound} />
            <StatCard
              label="团队人数"
              hint="含间接下级（闭包表全量）"
              value={relations?.teamCount ?? 0}
              icon={Network}
            />
          </div>

          {/* 身份 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" />
                分销身份
              </CardTitle>
              <CardDescription>该用户的账号信息与推广码</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div className="text-muted-foreground">昵称</div>
              <div className="break-all">{user.name || "（未设置）"}</div>
              <div className="text-muted-foreground">邮箱</div>
              <div className="break-all">{user.email}</div>
              <div className="text-muted-foreground">分销商</div>
              <div>{user.isDistributor ? "是" : "否"}</div>
              <div className="text-muted-foreground">推广码</div>
              <div>
                {user.referralCode ? (
                  <Badge variant="secondary" className="font-mono">
                    {user.referralCode}
                  </Badge>
                ) : (
                  "-"
                )}
              </div>
            </CardContent>
          </Card>

          {/* 上级链 */}
          <Card>
            <CardHeader>
              <CardTitle>上级链</CardTitle>
              <CardDescription>
                depth 1 是他的直接推荐人，数字越大越靠上；自然流量注册则整条链为空
              </CardDescription>
            </CardHeader>
            <CardContent>
              {relations && relations.ancestors.length > 0 ? (
                <ol className="space-y-2">
                  {relations.ancestors
                    .slice()
                    .sort((a, b) => a.depth - b.depth)
                    .map((ancestor) => (
                      <li
                        key={ancestor.userId}
                        className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <Badge variant="outline" className="tabular-nums">
                          depth {ancestor.depth}
                        </Badge>
                        <span className="font-medium">{ancestor.name}</span>
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          {ancestor.email}
                        </span>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  没有上级：该用户是自然流量注册（或上级账号已注销）。
                </p>
              )}
            </CardContent>
          </Card>

          {/* 他在谁的团队里 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                他的绑定上级
              </CardTitle>
              <CardDescription>
                作为客户，他当前的订单归属给谁；解绑只影响后续订单，历史佣金不动
              </CardDescription>
            </CardHeader>
            <CardContent>
              {relations?.bind ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 text-sm">
                  <div className="space-y-1">
                    <div className="font-medium">{relations.bind.distributorName}</div>
                    <div className="text-xs text-muted-foreground">
                      绑定时间{" "}
                      <span className="tabular-nums">
                        {formatDateTime(relations.bind.bindTime)}
                      </span>
                      {relations.bind.source ? ` · 来源 ${relations.bind.source}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void unbind()}>
                    <Unlink className="mr-1.5 h-4 w-4" />
                    解除绑定
                  </Button>
                </div>
              ) : (
                <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                  未绑定任何分销商：他的订单不会给任何人产生佣金。
                </p>
              )}
            </CardContent>
          </Card>

          {/* 他直接邀请的人 */}
          <Card>
            <CardHeader>
              <CardTitle>他直接邀请的人</CardTitle>
              <CardDescription>
                按 <span className="font-mono">invitedById</span> 统计，最多展示 200
                条；点「查看」可继续往下钻
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-0">用户</TableHead>
                    <TableHead className="w-[120px]">身份</TableHead>
                    <TableHead className="sticky-col-right w-[120px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relations && relations.invitees.length > 0 ? (
                    relations.invitees.map((invitee) => (
                      <TableRow key={invitee.id}>
                        <TableCell className="min-w-0">
                          <div className="truncate text-sm font-medium">{invitee.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {invitee.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          {invitee.isDistributor ? (
                            <Badge variant="info">分销商</Badge>
                          ) : (
                            <Badge variant="muted">普通客户</Badge>
                          )}
                        </TableCell>
                        <TableCell className="sticky-col-right">
                          <DataTableActions
                            actions={[
                              {
                                label: "查看",
                                icon: Search,
                                primary: true,
                                onClick: () => void run({ userId: invitee.id }),
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="p-0">
                        <EmptyState
                          icon={<Share2 className="h-6 w-6" />}
                          title="还没有邀请过任何人"
                          description="他分享推广链接后带来的注册用户会出现在这里"
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

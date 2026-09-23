"use client";

import * as React from "react";
import { RefreshCw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { useT } from "@/components/admin/lang-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

interface PromotionRow {
  userId: string;
  name: string;
  email: string;
  firstPromoteAt: string;
  invitedBy: string | null;
  inviteeCount: number;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const EMPTY: PaginationMeta = { page: 1, pageSize: 20, total: 0, totalPages: 0 };

/**
 * 自动升级记录（P1-8）。
 *
 * 本系统的分销商资格是**自动获得**的（首次成功推广即生效，无需申请审核），
 * 因此运营必须能回答一个问题：「这个账号是什么时候、因为谁变成分销商的？」
 * 这一页就是那条时间线（数据源：`User.firstPromoteAt` + 邀请关系 + 下级数）。
 */
export default function AdminDistributionPromotionsPage() {
  const t = useT();
  const [rows, setRows] = React.useState<PromotionRow[]>([]);
  const [pagination, setPagination] = React.useState<PaginationMeta>(EMPTY);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        /* 接口返回 `json({ data, pagination })`：`apiFetch` 会剥掉最外层信封，
         正好得到 `{ data, pagination }`（用 apiFetchRaw 会多包一层 data）。 */
        const res = await apiFetch<{ data: PromotionRow[]; pagination: PaginationMeta }>(
          `/api/admin/distribution/promotions?page=${p}`,
        );
        setRows(res.data);
        setPagination(res.pagination);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("加载升级记录失败"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  React.useEffect(() => {
    void load(page);
  }, [load, page]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("自动升级记录")}
        description={t(
          "分销商资格由「首次成功推广」自动授予（无需申请审核）。这里按时间倒序列出每次升级：谁、什么时候、被谁的链接带来、目前带了多少人",
        )}
        actions={
          <Button variant="outline" onClick={() => void load(page)} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {t("刷新")}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            {t("升级时间线")}
          </CardTitle>
          <CardDescription>
            {t("共 {total} 位分销商").replace("{total}", String(pagination.total))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Upload className="h-5 w-5" />}
              title={t("还没有自动升级记录")}
              description={t("当有人通过分销链接注册并成功后，该推广人会在这里出现。")}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-0">{t("分销商")}</TableHead>
                    <TableHead className="min-w-0">{t("Email")}</TableHead>
                    <TableHead className="w-[180px]">{t("升级时间")}</TableHead>
                    <TableHead className="min-w-0">{t("上级（邀请人）")}</TableHead>
                    <TableHead className="w-[100px] text-right">{t("已带人数")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.email}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(r.firstPromoteAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.invitedBy ?? t("（自然流量，无上级）")}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {r.inviteeCount}
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

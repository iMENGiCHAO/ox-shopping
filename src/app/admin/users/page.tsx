"use client";

import * as React from "react";
import { Eye, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminDrawer, AdminDrawerHeader } from "@/components/admin/admin-drawer";
import { DataTableActions } from "@/components/admin/data-table-actions";
import { UserEditDialog } from "@/components/admin/user-edit-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useT } from "@/components/admin/lang-provider";
import { CellText, CellPair } from "@/components/admin/cell-text";
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
  AdminOrder,
  AdminUser,
  AdminUserStatus,
} from "@/components/admin/types";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理员",
  SUPPORT: "客服",
  CUSTOMER: "顾客",
};

const PAGE_SIZE = 10;

function formatDateShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTimeShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

export default function AdminUsersPage() {
  const t = useT();

  const [rows, setRows] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const [detail, setDetail] = React.useState<AdminUser | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminUser | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
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
      const res = await apiFetchRaw<AdminListResult<AdminUser>>(
        `/api/admin/users?${params.toString()}`,
      );
      setRows(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleStatus = async (user: AdminUser, status: AdminUserStatus) => {
    setUpdatingId(user.id);
    try {
      await apiFetch(`/api/admin/users/${user.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast.success(status === "ACTIVE" ? "已启用用户" : "已停用用户");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新用户状态失败");
    } finally {
      setUpdatingId(null);
    }
  };

  const openDetail = async (user: AdminUser) => {
    setDetailOpen(true);
    setDetail(user);
    setDetailLoading(true);
    try {
      const res = await apiFetch<{ user: AdminUser; orders: AdminOrder[] }>(
        `/api/admin/users/${user.id}`,
      );
      setDetail({ ...res.user, orders: res.orders ?? [] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载用户详情失败");
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("Users")} description={t("View user info, order history and account status")} />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search email / name")}
                className="h-10 w-64 pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t("All statuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All statuses")}</SelectItem>
                <SelectItem value="ACTIVE">{t("Active")}</SelectItem>
                <SelectItem value="DISABLED">{t("Inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-0">{t("User Name")}</TableHead>
                <TableHead className="w-20">{t("Role")}</TableHead>
                <TableHead className="w-[120px]">注册时间</TableHead>
                <TableHead className="w-20 text-right">订单数</TableHead>
                <TableHead className="w-24">{t("Status")}</TableHead>
                <TableHead className="sticky-col-right w-[140px] text-right">
                  {t("Actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
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
                      icon={<Search className="h-6 w-6" />}
                      title={t("No users yet")}
                      description="请尝试调整筛选条件"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="min-w-0">
                      <CellPair primary={user.name} secondary={user.email} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.role} labelMap={{ ...ROLE_LABELS }} />
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {formatDateShort(user.createdAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user._count?.orders ?? 0}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.status === "ACTIVE"}
                        disabled={updatingId === user.id}
                        onCheckedChange={(v) => void toggleStatus(user, v ? "ACTIVE" : "DISABLED")}
                        aria-label={`切换 ${user.name} 的账户状态`}
                      />
                    </TableCell>
                    <TableCell className="sticky-col-right">
                      <div className="flex justify-end">
                        <DataTableActions
                          actions={[
                            { label: "编辑", icon: Pencil, onClick: () => setEditing(user) },
                            { label: "查看详情", icon: Eye, onClick: () => void openDetail(user), primary: true },
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

      {/* User details drawer */}
      <AdminDrawer open={detailOpen} onOpenChange={setDetailOpen}>
        <AdminDrawerHeader
          title={detail ? `用户：${detail.name}` : "用户详情"}
          description={detail ? detail.email : undefined}
        />
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">资料</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                  <div className="text-muted-foreground">{t("User Name")}</div>
                  <div>{detail.name}</div>
                  <div className="text-muted-foreground">{t("Email")}</div>
                  <div>{detail.email}</div>
                  <div className="text-muted-foreground">{t("Role")}</div>
                  <div>
                    <StatusBadge status={detail.role} labelMap={{ ...ROLE_LABELS }} />
                  </div>
                  <div className="text-muted-foreground">账户状态</div>
                  <div>
                    <StatusBadge
                      status={detail.status}
                      labelMap={{ ACTIVE: t("Active"), DISABLED: t("Inactive") }}
                    />
                  </div>
                  <div className="text-muted-foreground">邮箱已验证</div>
                  <div>{detail.emailVerified ? "已验证" : "未验证"}</div>
                  <div className="text-muted-foreground">注册时间</div>
                  <div>{new Date(detail.createdAt).toLocaleString("zh-CN")}</div>
                  <div className="text-muted-foreground">最后登录</div>
                  <div>
                    {detail.lastLoginAt
                      ? new Date(detail.lastLoginAt).toLocaleString("zh-CN")
                      : "-"}
                  </div>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">最近订单（{detail.orders?.length ?? 0}）</h3>
                {detail.orders && detail.orders.length > 0 ? (
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">{t("Order #")}</TableHead>
                        <TableHead className="w-24">{t("Status")}</TableHead>
                        <TableHead className="w-24 text-right">金额</TableHead>
                        <TableHead className="w-[120px]">时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">
                            <CellText value={order.orderNumber} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={order.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(order.total)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            {formatDateTimeShort(order.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                    该用户暂无订单
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </AdminDrawer>

      {/* EditUser */}
      <UserEditDialog
        user={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
}
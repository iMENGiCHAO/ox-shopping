"use client";

import * as React from "react";
import { Eye, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

import { apiFetch, apiFetchRaw } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminDrawer, AdminDrawerHeader } from "@/components/admin/admin-drawer";
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
  ADMIN: "Administrator",
  SUPPORT: "Support",
  CUSTOMER: "User",
};

const PAGE_SIZE = 10;

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
      toast.error(err instanceof Error ? err.message : "Failed to load users");
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
      toast.success(status === "ACTIVE" ? "User activated" : "User disabled");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user status");
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
      toast.error(err instanceof Error ? err.message : "Failed to load user details");
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
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="DISABLED">Disabled</SelectItem>
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
                <TableHead>Display name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="w-24 text-right">{t("Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
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
                      icon={<Search className="h-6 w-6" />}
                      title={t("No users yet")}
                      description="Try adjusting your filters"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <StatusBadge status={user.role} labelMap={{ ...ROLE_LABELS }} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(user.createdAt).toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell>{user._count?.orders ?? 0}</TableCell>
                    <TableCell>
                      <Switch
                        checked={user.status === "ACTIVE"}
                        disabled={updatingId === user.id}
                        onCheckedChange={(v) => void toggleStatus(user, v ? "ACTIVE" : "DISABLED")}
                        aria-label={`toggle ${user.name} Account status`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => setEditing(user)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => void openDetail(user)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Details
                        </Button>
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
          title={detail ? `User: ${detail.name}` : "User details"}
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
                <h3 className="text-sm font-semibold">Profile</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
                  <div className="text-muted-foreground">Display name</div>
                  <div>{detail.name}</div>
                  <div className="text-muted-foreground">Email</div>
                  <div>{detail.email}</div>
                  <div className="text-muted-foreground">Role</div>
                  <div>
                    <StatusBadge status={detail.role} labelMap={{ ...ROLE_LABELS }} />
                  </div>
                  <div className="text-muted-foreground">Account status</div>
                  <div>
                    <StatusBadge
                      status={detail.status}
                      labelMap={{ ACTIVE: "Active", DISABLED: "Disabled" }}
                    />
                  </div>
                  <div className="text-muted-foreground">Email verified</div>
                  <div>{detail.emailVerified ? "Verified" : "Unverified"}</div>
                  <div className="text-muted-foreground">Joined</div>
                  <div>{new Date(detail.createdAt).toLocaleString("zh-CN")}</div>
                  <div className="text-muted-foreground">Last login</div>
                  <div>
                    {detail.lastLoginAt
                      ? new Date(detail.lastLoginAt).toLocaleString("zh-CN")
                      : "-"}
                  </div>
                </div>
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Recent orders ({detail.orders?.length ?? 0})</h3>
                {detail.orders && detail.orders.length > 0 ? (
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>{t("Status")}</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                          <TableCell>
                            <StatusBadge status={order.status} />
                          </TableCell>
                          <TableCell>{formatMoney(order.total)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleString("zh-CN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                    This user has no orders yet
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

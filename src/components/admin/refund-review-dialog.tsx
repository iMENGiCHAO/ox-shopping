"use client";

import * as React from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { formatMoney } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { REFUND_STATUS_LABELS } from "@/lib/order-status";
import type { AdminRefund } from "@/components/admin/types";

export interface RefundReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** pending refund record to review */
  refund: AdminRefund | null;
  /** called on review completion (parent refreshes) */
  onReviewed?: () => void;
}

/** Refund review dialog: view order info, add note, approve / reject */
export function RefundReviewDialog({
  open,
  onOpenChange,
  refund,
  onReviewed,
}: RefundReviewDialogProps) {
  const [adminNote, setAdminNote] = React.useState("");
  const [loading, setLoading] = React.useState<"approve" | "reject" | null>(null);

  React.useEffect(() => {
    if (open) setAdminNote(refund?.adminNote ?? "");
  }, [open, refund]);

  const review = async (decision: "approve" | "reject") => {
    if (!refund) return;
    setLoading(decision);
    try {
      await apiFetch(`/api/admin/refunds/${refund.id}`, {
        method: "PUT",
        body: JSON.stringify({ decision, adminNote: adminNote.trim() || null }),
      });
      toast.success(decision === "approve" ? "已同意退款" : "已驳回退款");
      onOpenChange(false);
      onReviewed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "审核失败");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>退款审核</DialogTitle>
          <DialogDescription>请先查看退款详情再做出决定。</DialogDescription>
        </DialogHeader>
        {refund ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
              <div className="text-muted-foreground">订单号</div>
              <div>{refund.order?.orderNumber ?? "-"}</div>
              <div className="text-muted-foreground">申请人</div>
              <div>
                {refund.user?.name ?? "-"}({refund.user?.email ?? "-"})
              </div>
              <div className="text-muted-foreground">退款金额</div>
              <div className="font-semibold text-destructive">{formatMoney(refund.amount)}</div>
              <div className="text-muted-foreground">当前状态</div>
              <div>
                <StatusBadge status={refund.status} labelMap={{ ...REFUND_STATUS_LABELS }} />
              </div>
              <div className="text-muted-foreground">申请时间</div>
              <div>{new Date(refund.createdAt).toLocaleString("zh-CN")}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">退款原因</Label>
              <p className="rounded-md border bg-muted/30 p-3 text-sm">{refund.reason}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-note">审核备注（可选）</Label>
              <Textarea
                id="refund-note"
                rows={3}
                maxLength={500}
                placeholder="填写备注（会展示给顾客）"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading !== null}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={loading !== null}
            onClick={() => void review("reject")}
          >
            {loading === "reject" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            拒绝退款
          </Button>
          <Button disabled={loading !== null} onClick={() => void review("approve")}>
            {loading === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            批准退款
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

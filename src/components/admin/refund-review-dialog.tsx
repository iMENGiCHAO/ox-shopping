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
      toast.success(decision === "approve" ? "Refund approved" : "Refund rejected");
      onOpenChange(false);
      onReviewed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Refund review</DialogTitle>
          <DialogDescription>Please review the refund details before making a decision.</DialogDescription>
        </DialogHeader>
        {refund ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-4 text-sm">
              <div className="text-muted-foreground">Order #</div>
              <div>{refund.order?.orderNumber ?? "-"}</div>
              <div className="text-muted-foreground">Requested by</div>
              <div>
                {refund.user?.name ?? "-"}({refund.user?.email ?? "-"})
              </div>
              <div className="text-muted-foreground">Refund amount</div>
              <div className="font-semibold text-destructive">{formatMoney(refund.amount)}</div>
              <div className="text-muted-foreground">Current status</div>
              <div>
                <StatusBadge status={refund.status} labelMap={{ ...REFUND_STATUS_LABELS }} />
              </div>
              <div className="text-muted-foreground">Requested</div>
              <div>{new Date(refund.createdAt).toLocaleString("zh-CN")}</div>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Refund reason</Label>
              <p className="rounded-md border bg-muted/30 p-3 text-sm">{refund.reason}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-note">Review note (optional)</Label>
              <Textarea
                id="refund-note"
                rows={3}
                maxLength={500}
                placeholder="Write a note (shown to the customer)"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading !== null}>
            Cancel
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
            Reject refund
          </Button>
          <Button disabled={loading !== null} onClick={() => void review("approve")}>
            {loading === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

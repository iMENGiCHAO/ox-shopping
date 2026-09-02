"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, Mail, Server } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { apiFetch } from "@/lib/fetch-client";

interface Status {
  paymentMode: "stripe" | "mock";
  stripeConfigured: boolean;
  currency: string;
  mailProvider: string;
  storageDriver: "s3" | "local";
  s3Configured: boolean;
}

function Row({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <span
        className={
          ok
            ? "rounded-none bg-success/10 px-2 py-1 text-xs text-success"
            : "rounded-none bg-warning/10 px-2 py-1 text-xs text-warning"
        }
      >
        {value}
      </span>
    </div>
  );
}

/** 支付接口 — 只读状态面板（凭证来自服务器环境变量，不在后台存储） */
export default function AdminPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Status>("/api/admin/payments/status");
      setStatus(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="支付接口"
        description="当前收款/邮件/存储配置状态（只读；真实接入在部署环境变量中配置）"
      />
      {loading || !status ? (
        <Card className="rounded-none">
          <CardContent className="p-0">
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-none">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">收款方式</p>
            </div>
            <Row
              label="支付模式"
              value={status.paymentMode === "stripe" ? "Stripe（真实收款）" : "模拟支付（Mock）"}
              ok={status.paymentMode === "stripe"}
              hint="PAYMENT_MODE=auto/stripe/mock"
            />
            <Row
              label="Stripe 密钥"
              value={status.stripeConfigured ? "已配置" : "未配置"}
              ok={status.stripeConfigured}
              hint="STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
            />
            <Row
              label="结算币种"
              value={status.currency}
              ok
              hint="Stripe 不支持 CNY，真实收款请用 USD 等"
            />
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">邮件</p>
            </div>
            <Row
              label="邮件服务"
              value={status.mailProvider}
              ok={status.mailProvider !== "console"}
              hint="MAIL_PROVIDER=resend/smtp/console"
            />
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Server className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">文件存储</p>
            </div>
            <Row
              label="存储驱动"
              value={
                status.storageDriver === "s3"
                  ? `S3 对象存储${status.s3Configured ? "（已配置）" : "（未配置完整）"}`
                  : "本地磁盘（生产建议 S3）"
              }
              ok={status.storageDriver === "s3" && status.s3Configured}
              hint="STORAGE_DRIVER=s3 / local"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

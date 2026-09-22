"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DistributionShareCard } from "@/components/shop/distribution/share-card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";
import { ChangePasswordForm } from "@/components/shop/change-password-form";

/** Profile editor (client) */
export default function ProfilePage() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  /* 修改登录邮箱 */
  const [newEmail, setNewEmail] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  /* 注销申请状态（有值=在途申请，客服处理中；处理完成/驳回后清空） */
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const handleChangeEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      toast.error(t("Please enter a valid new email address"));
      return;
    }
    setChangingEmail(true);
    try {
      await apiFetch("/api/user/email", {
        method: "PUT",
        body: JSON.stringify({ newEmail: newEmail.trim(), currentPassword: confirmPassword }),
      });
      setEmail(newEmail.trim());
      setNewEmail("");
      setConfirmPassword("");
      toast.success(
        t("Sign-in email updated — other devices will need to sign in again with the new email"),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Failed to update, please try again later"),
      );
    } finally {
      setChangingEmail(false);
    }
  };

  const profileSchema = z.object({
    name: z
      .string()
      .trim()
      .min(2, t("Name must be at least 2 characters"))
      .max(30, t("Name can be at most 30 characters")),
  });

  type ProfileValues = z.infer<typeof profileSchema>;

  interface MeResponse {
    user: { name: string; email: string; deletionRequestedAt?: string | null };
  }

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    apiFetch<MeResponse>("/api/auth/me")
      .then((res) => {
        form.reset({ name: res.user.name });
        setEmail(res.user.email);
        setDeletionRequestedAt(res.user.deletionRequestedAt ?? null);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : t("Failed to load profile info")),
      )
      .finally(() => setLoading(false));
  }, [form, t]);

  const onSubmit = async (values: ProfileValues) => {
    setSaving(true);
    try {
      await apiFetch("/api/user/profile", {
        method: "PUT",
        body: JSON.stringify({ name: values.name }),
      });
      toast.success(t("Profile updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to save, please try again later"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletionRequest = async () => {
    setDeleting(true);
    try {
      await apiFetch("/api/user/deletion-request", {
        method: "POST",
        body: JSON.stringify({ reason: deleteReason.trim() || null }),
      });
      toast.success(
        t("Your deletion request has been received; we will process it after verification"),
      );
      setDeleteReason("");
      setDeletionRequestedAt(new Date().toISOString());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Failed to submit, please try again later"),
      );
    } finally {
      setDeleting(false);
    }
  };

  /* 撤回注销申请（处理完成前用户可自助反悔） */
  const handleWithdrawDeletion = async () => {
    setWithdrawing(true);
    try {
      await apiFetch("/api/user/deletion-request", { method: "DELETE" });
      setDeletionRequestedAt(null);
      toast.success(t("Deletion request withdrawn — your account is back to normal"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Failed to submit, please try again later"),
      );
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("Profile")}</CardTitle>
          <CardDescription>
            {t("Update your name. Your email is your sign-in ID and cannot be changed.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("Enter your name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>{t("Email (read-only)")}</FormLabel>
                <FormControl>
                  <Input value={email} readOnly disabled />
                </FormControl>
                <FormDescription>
                  {t("To change your sign-in email, use the Change sign-in email section below.")}
                </FormDescription>
              </FormItem>
              <Button type="submit" disabled={saving}>
                {saving ? t("Saving…") : t("Save changes")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* 分享赚佣金小卡片（大爷定制形态：不是左侧主入口，只是一张能复制链接的小卡；
          成功推广后卡片里才出现「进入分销中心」，点开是独立页面，不跟商城搅在一起） */}
      <DistributionShareCard />

      {/* 修改登录邮箱 —— 需验证当前密码，成功后全端重新登录 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("Change sign-in email")}</CardTitle>
          <CardDescription>
            {t(
              "Your sign-in email is your account ID. Changes require your current password; once updated, you'll be signed out on other devices and must sign in again with the new email.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="current-email" className="text-sm font-medium">
                {t("Current sign-in email")}
              </label>
              <Input id="current-email" value={email} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-email" className="text-sm font-medium">
                {t("New email")}
              </label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 sm:col-start-1">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                {t("Current password")}
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("Enter your current password to confirm")}
                autoComplete="current-password"
              />
            </div>
          </div>
          <Button
            className="mt-4"
            disabled={changingEmail || !newEmail.trim() || !confirmPassword}
            onClick={() => void handleChangeEmail()}
          >
            {changingEmail ? t("Submitting…") : t("Confirm changes")}
          </Button>
        </CardContent>
      </Card>

      {/* 修改密码 —— 大爷需求：并入个人资料页（原独立页 /account/password 重定向到此） */}
      <ChangePasswordForm />

      <Card>
        <CardHeader>
          <CardTitle>{t("Download my data")}</CardTitle>
          <CardDescription>
            {t("Export a copy of your personal data (profile, orders and subscriptions) as JSON.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => window.open("/api/user/export", "_blank")}>
            {t("Export my data")}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t("Account deletion request")}</CardTitle>
          <CardDescription>
            {t(
              "We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deletionRequestedAt ? (
            /* 在途申请：展示状态 + 自助撤回（大爷指正——申请必须有下文，且处理完成前可反悔） */
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                {t("Deletion request in progress")}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(
                  "We received your deletion request on {date}. Our team will process it within 30 days — your account stays fully usable until then.",
                  {
                    date: new Date(deletionRequestedAt).toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }),
                  },
                )}
              </p>
              <Button
                variant="outline"
                disabled={withdrawing}
                onClick={() => void handleWithdrawDeletion()}
              >
                {withdrawing ? t("Submitting…") : t("Withdraw deletion request")}
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t("Briefly explain why you want to delete your account (optional)")}
                rows={3}
                maxLength={500}
              />
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={() => void handleDeletionRequest()}
              >
                {deleting ? t("Submitting…") : t("Request account deletion")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

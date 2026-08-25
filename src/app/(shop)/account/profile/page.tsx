"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const handleChangeEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      toast.error("Please enter a valid new email address");
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
      toast.success("Sign-in email updated — other devices will need to sign in again with the new email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update, please try again later");
    } finally {
      setChangingEmail(false);
    }
  };

  const profileSchema = z.object({
    name: z.string().trim().min(2, t("Name must be at least 2 characters")).max(30, t("Name can be at most 30 characters")),
  });

  type ProfileValues = z.infer<typeof profileSchema>;

  interface MeResponse {
    user: { name: string; email: string };
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
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : t("Failed to load profile info")))
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
      toast.success(t("Your deletion request has been received; we will process it after verification"));
      setDeleteReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to submit, please try again later"));
    } finally {
      setDeleting(false);
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
          <CardDescription>{t("Update your name. Your email is your sign-in ID and cannot be changed.")}</CardDescription>
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
                <FormDescription>To change your sign-in email, use the “Change sign-in email” section below.</FormDescription>
              </FormItem>
              <Button type="submit" disabled={saving}>
                {saving ? t("Saving…") : t("Save changes")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* 修改登录邮箱 —— 需验证当前密码，成功后全端重新登录 */}
      <Card>
        <CardHeader>
          <CardTitle>Change sign-in email</CardTitle>
          <CardDescription>
            Your sign-in email is your account ID. Changes require your current password; once updated, you&apos;ll be signed out on other devices and must sign in again with the new email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="current-email" className="text-sm font-medium">Current sign-in email</label>
              <Input id="current-email" value={email} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-email" className="text-sm font-medium">New email</label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5 sm:col-start-1 sm:col-span-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">Current password</label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Enter your current password to confirm"
                autoComplete="current-password"
              />
            </div>
          </div>
          <Button
            className="mt-4"
            disabled={changingEmail || !newEmail.trim() || !confirmPassword}
            onClick={() => void handleChangeEmail()}
          >
            {changingEmail ? "Submitting…" : "Confirm changes"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">{t("Account deletion request")}</CardTitle>
          <CardDescription>
            {t("We will review your request and delete your account and related data after verifying your identity (excluding data we are legally required to keep). This action is irreversible — please proceed carefully.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>
    </div>
  );
}

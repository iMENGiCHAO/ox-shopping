"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useT } from "@/components/admin/lang-provider";
const profileSchema = z.object({
  name: z.string().trim().min(2, "显示名至少 2 个字符").max(30, "显示名最多 30 个字符"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z
      .string()
      .min(8, "新密码至少 8 个字符")
      .max(72, "新密码最多 72 个字符")
      .regex(/[a-z]/, "需包含小写字母")
      .regex(/[A-Z]/, "需包含大写字母")
      .regex(/[0-9]/, "需包含数字"),
    confirmPassword: z.string().min(1, "请再次输入新密码"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的密码不一致",
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

/** My account: change display name + change password (admin personal settings) */
export function AccountSettings() {
  const t = useT();

  const [email, setEmail] = React.useState("");
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "" },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  React.useEffect(() => {
    apiFetch<{ user: { name: string; email: string } }>("/api/auth/me")
      .then((res) => {
        setEmail(res.user.email);
        profileForm.reset({ name: res.user.name });
      })
      .catch(() => undefined);
  }, [profileForm]);

  const saveProfile = profileForm.handleSubmit(async (values) => {
    setSavingProfile(true);
    try {
      await apiFetch("/api/user/profile", { method: "PUT", body: JSON.stringify(values) });
      toast.success(t("Display name updated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新显示名失败");
    } finally {
      setSavingProfile(false);
    }
  });

  const savePassword = passwordForm.handleSubmit(async (values) => {
    setSavingPassword(true);
    try {
      await apiFetch("/api/user/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      toast.success(t("Password changed"));
      passwordForm.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "修改密码失败");
    } finally {
      setSavingPassword(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          我的账户
        </CardTitle>
        <CardDescription>修改当前账户的显示名与登录密码</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {/* Display name */}
        <form onSubmit={saveProfile} className="space-y-3" aria-label="账户资料">
          <div className="space-y-2">
            <Label htmlFor="acc-email">登录邮箱（不可修改）</Label>
            <Input id="acc-email" value={email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-name">显示名 *</Label>
            <Input id="acc-name" placeholder={t("Enter a display name")} {...profileForm.register("name")} />
            {profileForm.formState.errors.name ? (
              <p className="text-xs text-destructive">{profileForm.formState.errors.name.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存显示名
          </Button>
        </form>

        {/* Password */}
        <form onSubmit={savePassword} className="space-y-3" aria-label="修改密码">
          <div className="space-y-2">
            <Label htmlFor="acc-cur">当前密码 *</Label>
            <Input
              id="acc-cur"
              type="password"
              autoComplete="current-password"
              {...passwordForm.register("currentPassword")}
            />
            {passwordForm.formState.errors.currentPassword ? (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-new">新密码 *</Label>
            <Input
              id="acc-new"
              type="password"
              autoComplete="new-password"
              {...passwordForm.register("newPassword")}
            />
            {passwordForm.formState.errors.newPassword ? (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.newPassword.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-confirm">确认新密码 *</Label>
            <Input
              id="acc-confirm"
              type="password"
              autoComplete="new-password"
              {...passwordForm.register("confirmPassword")}
            />
            {passwordForm.formState.errors.confirmPassword ? (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.confirmPassword.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={savingPassword}>
            {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            修改密码
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

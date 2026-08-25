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
  name: z.string().trim().min(2, "Display name must be at least 2 characters").max(30, "Display name must be at most 30 characters"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters")
      .regex(/[a-z]/, "Must contain a lowercase letter")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a digit"),
    confirmPassword: z.string().min(1, "Please confirm the new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
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
      toast.error(err instanceof Error ? err.message : "Failed to update display name");
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
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          My account
        </CardTitle>
        <CardDescription>Change the display name and password of the current account</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {/* Display name */}
        <form onSubmit={saveProfile} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="acc-email">Login email (not editable)</Label>
            <Input id="acc-email" value={email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="acc-name">Display name *</Label>
            <Input id="acc-name" placeholder={t("Enter a display name")} {...profileForm.register("name")} />
            {profileForm.formState.errors.name ? (
              <p className="text-xs text-destructive">{profileForm.formState.errors.name.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save name
          </Button>
        </form>

        {/* Password */}
        <form onSubmit={savePassword} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="acc-cur">Current password *</Label>
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
            <Label htmlFor="acc-new">New password *</Label>
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
            <Label htmlFor="acc-confirm">Confirm new password *</Label>
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
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

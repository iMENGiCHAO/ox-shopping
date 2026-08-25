"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUser, AdminRole, AdminUserStatus } from "@/components/admin/types";

import { useT } from "@/components/admin/lang-provider";
const editSchema = z.object({
  name: z.string().trim().min(2, "Display name must be at least 2 characters").max(30),
  email: z.string().trim().toLowerCase().email("Invalid email format").max(254),
  role: z.enum(["ADMIN", "CUSTOMER", "SUPPORT"]),
  status: z.enum(["ACTIVE", "DISABLED"]),
});

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[a-z]/, "Must contain a lowercase letter")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a digit"),
    confirm: z.string().min(1, "Please confirm the password"),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

type EditValues = z.infer<typeof editSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export interface UserEditDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** User edit dialog: name/email/role/status + reset password */
export function UserEditDialog({ user, open, onOpenChange, onSaved }: UserEditDialogProps) {
  const t = useT();

  const [saving, setSaving] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", email: "", role: "CUSTOMER", status: "ACTIVE" },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  React.useEffect(() => {
    if (open && user) {
      form.reset({
        name: user.name,
        email: user.email,
        role: user.role as AdminRole,
        status: user.status as AdminUserStatus,
      });
      setShowPassword(false);
      passwordForm.reset({ password: "", confirm: "" });
    }
  }, [open, user, form, passwordForm]);

  const handleSave = form.handleSubmit(async (values) => {
    if (!user) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PUT", body: JSON.stringify(values) });
      toast.success(t("User info updated"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  });

  const handleResetPassword = passwordForm.handleSubmit(async (values) => {
    if (!user) return;
    setResetting(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: values.password }),
      });
      toast.success(t("Password reset — this user must sign in again"));
      setShowPassword(false);
      passwordForm.reset({ password: "", confirm: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && !resetting && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>EditUser</DialogTitle>
          <DialogDescription>Edit user profile, role and status</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ue-name">Display name *</Label>
            <Input id="ue-name" {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ue-email">Email *</Label>
            <Input id="ue-email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={form.watch("role")}
                onValueChange={(v) => form.setValue("role", v as AdminRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as AdminUserStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="DISABLED">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPassword((s) => !s)}
              disabled={saving || resetting}
            >
              <KeyRound className="h-4 w-4" />
              Reset password
            </Button>
            <Button type="submit" disabled={saving || resetting}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>

        {showPassword ? (
          <form onSubmit={handleResetPassword} className="space-y-3 rounded-md border bg-muted/40 p-4">
            <p className="text-sm font-medium">Reset password (user must sign in again after reset)</p>
            <div className="space-y-2">
              <Label htmlFor="ue-pass">New password *</Label>
              <Input id="ue-pass" type="password" autoComplete="new-password" {...passwordForm.register("password")} />
              {passwordForm.formState.errors.password ? (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.password.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ue-pass2">Confirm password *</Label>
              <Input id="ue-pass2" type="password" autoComplete="new-password" {...passwordForm.register("confirm")} />
              {passwordForm.formState.errors.confirm ? (
                <p className="text-xs text-destructive">{passwordForm.formState.errors.confirm.message}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowPassword(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={resetting}>
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm reset
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

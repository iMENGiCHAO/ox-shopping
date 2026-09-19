"use client";

/**
 * 修改密码表单（客户端）——原 /account/password 独立页抽取的公共组件。
 * 大爷需求：修改密码并入个人资料页（/account/profile 渲染此组件）；
 * 旧路由 /account/password 重定向到 /account/profile#change-password 保持旧链接可用。
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

export function ChangePasswordForm() {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

  const passwordRule = z
    .string()
    .min(8, t("Password must be at least 8 characters"))
    .max(72, t("Password can be at most 72 characters"))
    .regex(/[a-z]/, t("Password must contain a lowercase letter"))
    .regex(/[A-Z]/, t("Password must contain an uppercase letter"))
    .regex(/[0-9]/, t("Password must contain a digit"));

  const changePasswordSchema = z
    .object({
      currentPassword: z.string().min(1, t("Please enter your current password")).max(72),
      newPassword: passwordRule,
      confirmPassword: z.string().min(1, t("Please re-enter the new password")),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ["confirmPassword"],
      message: t("Passwords do not match"),
    });

  type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ChangePasswordValues) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/user/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      toast.success(t("Password changed — please sign in with your new password"));
      form.reset();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Failed to change, please try again later"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card id="change-password">
      <CardHeader>
        <CardTitle>{t("Change Password")}</CardTitle>
        <CardDescription>
          {t(
            "Password must be 8-72 chars and include both uppercase and lowercase letters and a digit.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="max-w-sm space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Current Password")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("New Password")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Confirm new password")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? t("Submitting…") : t("Confirm changes")}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

/**
 * 强制改密表单（B-2 临时密码首登）。
 *
 * 三条字段：临时密码（邮件里那串）+ 新密码 + 确认新密码。
 * 客户端校验与服务端 `passwordSchema` 保持同一口径（8-72 位、大小写 + 数字），
 * 避免出现「表单放行、接口 400」的割裂体验。
 *
 * 提交目标刻意复用 `PUT /api/user/password`：改密逻辑（校验当前密码、哈希、
 * 吊销全部会话、重签会话、清 mustChangePassword 标记）在服务端只有一份，
 * 不为强制路径再写第二条实现 —— 双实现必然漂移。
 */
export function ChangeTempPasswordForm({ email }: { email: string }) {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const schema = z
    .object({
      currentPassword: z.string().min(1, t("Please enter your current password")).max(72),
      newPassword: z
        .string()
        .min(8, t("Password must be at least 8 characters"))
        .max(72, t("Password can be at most 72 characters"))
        .regex(/[a-z]/, t("Password must contain a lowercase letter"))
        .regex(/[A-Z]/, t("Password must contain an uppercase letter"))
        .regex(/[0-9]/, t("Password must contain a digit")),
      confirmPassword: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ["confirmPassword"],
      message: t("New passwords do not match"),
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      path: ["newPassword"],
      message: t("The new password must be different from the current password"),
    });

  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/user/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      toast.success(t("Password updated"));
      // 整页导航（而非 router.push）：改密响应刚清掉「强制改密」cookie，
      // 服务端渲染的布局（Header/UserMenu/入口门控）必须重新读会话与 Cookie 才能解除限制，
      // 客户端路由跳转不会重跑服务端布局。
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Update failed, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* 登出失败不阻断：下面照样整页跳登录 */
    } finally {
      setSigningOut(false);
      // 同上：登出会清掉会话与强制改密 cookie，必须整页导航重跑服务端布局
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/auth/login");
    }
  };

  return (
    <div className="flex justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("Set a new password")}</CardTitle>
          <CardDescription>
            {t(
              "Your temporary password has been sent to your email. Enter it below and choose a new password to continue.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("Signed in as")}: <span className="font-medium text-foreground">{email}</span>
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Temporary password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder={t("Temporary password")}
                        {...field}
                      />
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
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("Please enter a new password")}
                        {...field}
                      />
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
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("Please re-enter the new password")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-xs text-muted-foreground">
                {t("Please enter a new password (8-72 chars with upper/lowercase and a digit).")}
              </p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("Submitting…") : t("Update password")}
              </Button>
            </form>
          </Form>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("Sign out")}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

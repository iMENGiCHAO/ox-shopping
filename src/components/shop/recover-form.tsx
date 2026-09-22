"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

/**
 * 找回密码表单（客户端）。
 *
 * 文案逐字对齐原站 `/account/login#recover`：
 *   h1 `Recover password` / 副标题 `Enter your email to recover your password:`
 *   / 框内 placeholder `E-mail` / 按钮 `Recover`
 *   / 底部 `Remember your password?` + `Back to login`
 *
 * 视觉沿用登录页（`.auth-shell` / `.auth-card` / `.auth-form`），
 * 与原站「登录与找回是同一套版式、同一页内切换」的形态一致：
 * 登录页里 `Forgot your password?` 直接在**页内**切到本表单（不跳转），
 * 而 `/auth/forgot-password` 独立路由也渲染同一个组件（便于邮件/书签直达）。
 *
 * 安全约定（**不要改**）：无论邮箱是否存在都返回同一句成功提示，
 * 避免通过「提示差异」枚举已注册邮箱。
 */
export function RecoverForm({ onBack }: { onBack?: () => void }) {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const schema = z.object({
    email: z.string().trim().toLowerCase().email(t("Invalid email format")),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      // 无论邮箱是否存在都走同一分支（防枚举）
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Request failed, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  /** 返回登录：页内切换时用回调，独立路由时用链接 */
  const backToLogin = (className: string, label: string) =>
    onBack ? (
      <button type="button" onClick={onBack} className={className}>
        {label}
      </button>
    ) : (
      <Link href="/auth/login" className={className}>
        {label}
      </Link>
    );

  return (
    <>
      <h1 className="text-center text-[22px] font-normal tracking-[0.01em] text-foreground">
        {t("Recover password")}
      </h1>
      <p className="mt-5 text-center text-[13px] text-foreground">
        {t("Enter your email to recover your password:")}
      </p>

      {sent ? (
        <div className="mt-7 text-center" data-testid="recover-sent">
          <p className="text-[13px] leading-relaxed text-foreground/70">
            {t(
              "Your recovery request has been submitted. An administrator will review it, then email you a temporary password.",
            )}
          </p>
        </div>
      ) : (
        <Form {...form}>
          <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="auth-form">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  {/* 原站形态：字段名是**框内 placeholder**（灰字），不是框外 label */}
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder={t("E-mail")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-[46px] w-full text-[15px]" disabled={submitting}>
              {submitting ? t("Sending…") : t("Recover")}
            </Button>
          </form>
        </Form>
      )}

      <div className="mt-6 text-center text-sm text-foreground/60">
        <span>{t("Remember your password?")} </span>
        {backToLogin("transition-colors hover:text-foreground", t("Back to login"))}
      </div>
    </>
  );
}

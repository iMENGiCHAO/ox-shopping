"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RecoverForm } from "@/components/shop/recover-form";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

interface LoginResponse {
  user: { name: string; email: string };
  /** 管理员已发放临时密码：本次登录后必须立即改密（B-2） */
  mustChangePassword?: boolean;
}

/** Login form (client) */
export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  /**
   * 页内视图切换。原站 `/account/login` 是**同一页**承载「登录」与「找回密码」
   * 两个表单（`#login` / `#recover` 锚点切换），点 `Forgot your password?`
   * 不跳页。这里用同一形态：不新增路由、不改 URL。
   * 独立路由 `/auth/forgot-password` 仍然保留，渲染同一个 RecoverForm。
   */
  const [view, setView] = useState<"login" | "recover">("login");

  const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email(t("Invalid email format")),
    password: z.string().min(1, t("Please enter your password")).max(72),
  });

  type LoginValues = z.infer<typeof loginSchema>;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      // Notify global state (cart merge, etc.)
      window.dispatchEvent(new CustomEvent("auth:login"));
      // 临时密码首登：不显示「欢迎回来」而是直接送去改密页
      // （服务端已置强制改密 cookie，其它页面本来也会被中间件弹回这里）
      if (res.mustChangePassword) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/auth/change-password");
        return;
      }
      toast.success(t("Welcome back, {name}!", { name: res.user?.name ?? "user" }));
      // 整页导航：登录后共享 layout（Header/UserMenu）是服务端渲染的，
      // router.push() 在同一 layout 内导航不会重新渲染 layout，
      // 导致顶栏仍显示 Login 直到手动刷新。整页导航确保服务端重新读取会话。
      window.location.assign(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Sign-in failed, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {view === "recover" ? (
          <RecoverForm onBack={() => setView("login")} />
        ) : (
          <>
            <h1 className="text-center text-[22px] font-normal tracking-[0.01em] text-foreground">
              {t("Login")}
            </h1>
            {/* 原站实测：副标题是**纯黑**（最深像素 rgb(28,28,28)），不是灰 */}
            <p className="mt-5 text-center text-[13px] text-foreground">
              {t("Enter your email and password to login:")}
            </p>

            <Form {...form}>
              <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="auth-form">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      {/* 原站形态：字段名是**框内 placeholder**（灰字），不是框外 label */}
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder={t("E-mail")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      {/* 原站形态：`Forgot your password?` 在**密码框内部右侧**，
                          与 placeholder 同一行。故用相对定位叠在输入框上，
                          并给输入框留出右侧内边距避免文字重叠。
                          原站交互：点击后在**页内**切到找回密码表单，不跳页。 */}
                      <FormControl>
                        <div className="relative">
                          <Input
                            type="password"
                            autoComplete="current-password"
                            placeholder={t("Password")}
                            className="pr-[168px]"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setView("recover")}
                            className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-[13px] opacity-60 transition-opacity hover:opacity-100"
                          >
                            {t("Forgot your password?")}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="h-[46px] w-full text-[15px]" disabled={submitting}>
                  {submitting ? t("Signing in…") : t("Login")}
                </Button>
              </form>
            </Form>

            {/* 原站实测：整行（含 Sign up 链接）同为 60% 黑、**无下划线**；
                链接仅用 hover 变深作为可点击提示 */}
            <div className="mt-6 text-center text-sm text-foreground/60">
              <span>{t("Don't have an account?")} </span>
              <Link href="/auth/register" className="transition-colors hover:text-foreground">
                {t("Sign up")}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

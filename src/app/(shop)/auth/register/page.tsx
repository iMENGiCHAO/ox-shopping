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
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";

/** Password strength: 0-3 (length / char variety / special chars) */
function passwordStrength(plain: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (plain.length >= 8) score++;
  if (/[a-z]/.test(plain) && /[A-Z]/.test(plain) && /[0-9]/.test(plain)) score++;
  if (/[^a-zA-Z0-9]/.test(plain)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const STRENGTH_COLORS = ["bg-destructive", "bg-warning", "bg-info", "bg-success"] as const;

/** Register page (client) */
export default function RegisterPage() {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

  const STRENGTH_LABELS = [t("Weak"), t("Fair"), t("Good"), t("Strong")] as const;

  const registerSchema = z.object({
    email: z.string().trim().toLowerCase().email(t("Invalid email format")).max(254),
    /* 原站注册页是 4 个「只有 placeholder」的输入框：First name / Last name / E-mail / Password，
       没有框外 label。本站 users 表只有一个 name 字段，故拆成两个输入框、提交时拼成一个 name。 */
    firstName: z
      .string()
      .trim()
      .min(1, t("Please enter your first name"))
      .max(30, t("Name can be at most 30 characters")),
    lastName: z
      .string()
      .trim()
      .min(1, t("Please enter your last name"))
      .max(29, t("Name can be at most 30 characters")),
    password: z
      .string()
      .min(8, t("Password must be at least 8 characters"))
      .max(72, t("Password can be at most 72 characters"))
      .regex(/[a-z]/, t("Password must contain a lowercase letter"))
      .regex(/[A-Z]/, t("Password must contain an uppercase letter"))
      .regex(/[0-9]/, t("Password must contain a digit")),
  });

  type RegisterValues = z.infer<typeof registerSchema>;

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", firstName: "", lastName: "", password: "" },
  });

  const password = form.watch("password");
  const strength = passwordStrength(password);

  const onSubmit = async (values: RegisterValues, e?: React.BaseSyntheticEvent) => {
    setSubmitting(true);
    try {
      // 蜜罐：不进 RHF 状态，直接从 form 元素取值（对人类不可见的 input，机器人才会填）
      const formEl = e?.currentTarget as HTMLFormElement | undefined;
      const honeypot =
        (formEl?.elements.namedItem("company") as HTMLInputElement | null)?.value ?? "";
      await apiFetch("/api/auth/register", {
        method: "POST",
        // 两个输入框拼回单字段 name（服务端 users.name 只有一个）
        body: JSON.stringify({
          email: values.email,
          name: `${values.firstName} ${values.lastName}`.trim(),
          password: values.password,
          company: honeypot,
        }),
      });
      toast.success(t("Registration successful!"));
      window.dispatchEvent(new CustomEvent("auth:login"));
      // 整页导航：注册后服务端渲染的 Header 需重新读取会话
      // （router.push() 在同一 layout 内不会重渲染 layout，顶栏会残留 Login）
      window.location.href = "/";
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Registration failed, please try again later"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="text-center text-[22px] font-normal tracking-[0.01em] text-foreground">
          {t("Sign Up")}
        </h1>
        {/* 原站实测：副标题是**纯黑**，不是灰 */}
        <p className="mt-5 text-center text-[13px] text-foreground">
          {t("Please fill in the information below:")}
        </p>
        <Form {...form}>
          <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="auth-form">
            {/* 蜜罐字段：屏幕外隐藏 + 不可聚焦；机器人自动填表会带上，服务端静默拒绝 */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="pointer-events-none absolute left-[-9999px] top-auto h-0 w-0 opacity-0"
            />
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  {/* 原站形态：字段名是**框内 placeholder**，没有框外 label */}
                  <FormControl>
                    <Input placeholder={t("First name")} autoComplete="given-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input placeholder={t("Last name")} autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="email" placeholder={t("E-mail")} autoComplete="email" {...field} />
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
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={t("Password")}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  {/* 密码强度条：原站没有，属本站保留的实用增强 */}
                  {/* Note: must not go inside FormDescription (<p>) — div nesting p triggers a hydration error */}
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1 flex-1 rounded-full",
                            strength > i ? STRENGTH_COLORS[strength] : "bg-muted",
                          )}
                        />
                      ))}
                    </div>
                    <span
                      className={cn(
                        "text-xs",
                        strength > 0 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t("Password strength")}: {STRENGTH_LABELS[strength]}
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="h-[46px] w-full text-[15px]" disabled={submitting}>
              {submitting ? t("Signing up…") : t("Sign up")}
            </Button>
          </form>
        </Form>
        {/* 原站实测：整行（含 Login 链接）同为 60% 黑、**无下划线** */}
        <p className="mt-6 text-center text-sm text-foreground/60">
          <span>{t("Already have an account?")} </span>
          <Link href="/auth/login" className="transition-colors hover:text-foreground">
            {t("Login")}
          </Link>
        </p>
      </div>
    </div>
  );
}

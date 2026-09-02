"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ShieldCheck, Store } from "lucide-react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/fetch-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionUser } from "@/types/api";
import { useT } from "@/components/admin/lang-provider";

const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱"),
  password: z.string().min(1, "密码必填").max(72),
});

type LoginValues = z.infer<typeof adminLoginSchema>;

/** Login response: { user, ... } or a direct SessionUser */
type LoginResponse = { user: SessionUser } | SessionUser;

function getLoginUser(res: LoginResponse): SessionUser {
  return "user" in res ? res.user : res;
}

function LoginForm() {
  const t = useT();

  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const form = useForm<LoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
  });
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = form.handleSubmit(async (values) => {
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ ...values, scope: "admin" }),
      });
      const user = getLoginUser(res);
      if (user.role !== "ADMIN" && user.role !== "SUPPORT") {
        toast.error(t("This account does not have admin access"));
        try {
          await apiFetch("/api/auth/logout", { method: "POST" });
        } catch {
          /* session cleanup failure is non-blocking */
        }
        return;
      }
      window.dispatchEvent(new CustomEvent("auth:login"));
      toast.success(`${t("Welcome back")}, ${user.name}`);
      const target = next && next.startsWith("/admin") ? next : "/admin";
      router.push(target);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Sign in failed, please try again"));
    } finally {
      setLoading(false);
    }
  });

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-card">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.04] text-foreground">
          <Store className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ox Shopping · {t("Admin")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("Sign in with your administrator account")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">{t("Email")}</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="admin@example.com"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">{t("Password")}</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder={t("Password")}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {t("Sign In")}
        </Button>
      </form>

      <div className="mt-6 rounded-md bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
        {t("Demo account")}: admin@example.com / Admin@123456 (Admin)
        <br />
        support@example.com / Support@123456 (Support)
      </div>

      <p className="mt-4 text-center text-[12px] text-muted-foreground">
        <Link href="/" className="hover:underline">
          {t("returns to Store")}
        </Link>
      </p>
    </div>
  );
}

/** Admin login page — 现代 SaaS 居中卡片（冷调浅灰渐变底） */
export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <React.Suspense fallback={null}>
        <LoginForm />
      </React.Suspense>
    </div>
  );
}

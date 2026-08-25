"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

interface LoginResponse {
  user: { name: string; email: string };
}

/** Login form (client) */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

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
      toast.success(t("Welcome back, {name}!", { name: res.user?.name ?? "user" }));
      // Notify global state (cart merge, etc.)
      window.dispatchEvent(new CustomEvent("auth:login"));
      router.push(next);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Sign-in failed, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-5 py-14">
      <h1 className="text-center text-[22px] font-normal tracking-[0.01em] text-foreground">
        {t("Login")}
      </h1>
      <p className="mt-3 text-center text-[13px] opacity-60">
        {t("Enter your email and password to login:")}
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("E-mail")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
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
                <div className="flex items-center justify-between">
                  <FormLabel>{t("Password")}</FormLabel>
                  <Link
                    href="/auth/forgot-password"
                    className="text-[13px] opacity-60 transition-opacity hover:opacity-100"
                  >
                    {t("Forgot password?")}
                  </Link>
                </div>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    {...field}
                  />
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

      <div className="mt-6 text-center text-sm">
        <span className="opacity-60">{t("Don't have an account?")} </span>
        <Link href="/auth/register" className="text-primary underline underline-offset-4 hover:opacity-80">
          {t("Sign up")}
        </Link>
      </div>
    </div>
  );
}

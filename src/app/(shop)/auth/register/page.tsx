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
  const router = useRouter();
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

  const STRENGTH_LABELS = [t("Weak"), t("Fair"), t("Good"), t("Strong")] as const;

  const registerSchema = z.object({
    email: z.string().trim().toLowerCase().email(t("Invalid email format")).max(254),
    name: z.string().trim().min(2, t("Name must be at least 2 characters")).max(30, t("Name can be at most 30 characters")),
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
    defaultValues: { email: "", name: "", password: "" },
  });

  const password = form.watch("password");
  const strength = passwordStrength(password);

  const onSubmit = async (values: RegisterValues) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast.success(t("Registration successful!"));
      window.dispatchEvent(new CustomEvent("auth:login"));
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Registration failed, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[440px] px-5 py-14">
      <h1 className="text-center text-[22px] font-normal tracking-[0.01em] text-foreground">
        {t("Sign Up")}
      </h1>
      <p className="mt-2 text-center text-[13px] opacity-60">
        {t("Create your Ox Shopping account and start shopping.")}
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Email")}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Name")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("2-30 characters")} autoComplete="nickname" {...field} />
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
                    <FormLabel>{t("Password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("At least 8 chars with upper/lowercase and a digit")}
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
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
          <p className="mt-4 text-xs leading-relaxed opacity-60">
            {t("Notice: after registering, you may need to verify your email (if no email service is configured, this is logged server-side and does not affect sign-in).")}
          </p>
          <p className="mt-6 border-t border-border pt-4 text-center text-sm">
            {t("Already have an account?")}
            <Link href="/auth/login" className="ml-1 text-primary underline-offset-4 hover:underline">
              {t("Sign in")}
            </Link>
          </p>
        </div>
  );
}

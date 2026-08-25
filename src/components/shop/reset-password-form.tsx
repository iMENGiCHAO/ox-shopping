"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** Reset password form (client; token passed in by server page) */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

  const resetPasswordSchema = z.object({
    token: z.string().min(20, t("Reset link is invalid or has expired")),
    password: z
      .string()
      .min(8, t("Password must be at least 8 characters"))
      .max(72, t("Password can be at most 72 characters"))
      .regex(/[a-z]/, t("Password must contain a lowercase letter"))
      .regex(/[A-Z]/, t("Password must contain an uppercase letter"))
      .regex(/[0-9]/, t("Password must contain a digit")),
  });

  type ResetValues = z.infer<typeof resetPasswordSchema>;

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "" },
  });

  const onSubmit = async (values: ResetValues) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: values.token, password: values.password }),
      });
      toast.success(t("Password reset — please sign in with your new password"));
      router.push("/auth/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Reset failed, please try again later"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex justify-center py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("Reset Password")}</CardTitle>
          <CardDescription>{t("Please enter a new password (8-72 chars with upper/lowercase and a digit).")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("New Password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("Please enter a new password")}
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("Submitting…") : t("Confirm reset")}
              </Button>
            </form>
          </Form>
          <p className="mt-4 text-center text-sm">
            <Link href="/auth/login" className="text-primary hover:underline">
              {t("Back to sign in")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

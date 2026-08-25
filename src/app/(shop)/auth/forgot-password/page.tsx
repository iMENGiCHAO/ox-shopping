"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/** Forgot password (client) */
export default function ForgotPasswordPage() {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const forgotPasswordSchema = z.object({
    email: z.string().trim().toLowerCase().email(t("Invalid email format")),
  });

  type ForgotValues = z.infer<typeof forgotPasswordSchema>;

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotValues) => {
    setSubmitting(true);
    try {
      // Always return success to avoid user enumeration
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

  return (
    <div className="flex justify-center py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("Forgot Password")}</CardTitle>
          <CardDescription>{t("Enter your registered email — we will send you a reset link.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-success" />
              <p className="text-sm text-muted-foreground">
                {t("If that email is registered, a reset email is on its way. If no email service is configured, check the server logs.")}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/auth/login">{t("Back to sign in")}</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? t("Sending…") : t("Send reset email")}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
        <CardFooter className="justify-center text-sm">
          {t("Remember it now?")}
          <Link href="/auth/login" className="ml-1 text-primary hover:underline">
            {t("Sign in")}
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

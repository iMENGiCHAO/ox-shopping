"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";

type VerifyState = "verifying" | "success" | "error";

/** Email verification (client; token passed in by server page) */
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useT();
  const [state, setState] = useState<VerifyState>("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage(t("Missing verification token — please open this page through the link in the email."));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await apiFetch("/api/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!cancelled) setState("success");
      } catch (err) {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : t("Verification failed, please try again later"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <div className="flex justify-center py-12">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          {state === "verifying" ? (
            <>
              <Skeleton className="h-16 w-16 rounded-full" />
              <p className="text-sm text-muted-foreground">{t("Verifying your email…")}</p>
            </>
          ) : state === "success" ? (
            <>
              <CheckCircle2 className="h-16 w-16 text-success" />
              <h1 className="text-xl font-bold">{t("Email verified!")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("Your email has been verified — you can now access all features.")}
              </p>
              <Button asChild>
                <Link href="/auth/login">{t("Sign in")}</Link>
              </Button>
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <h1 className="text-xl font-bold">{t("Email verification failed")}</h1>
              <p className="text-sm text-muted-foreground">
                {message || t("Verification link invalid or expired — please resend the verification email.")}
              </p>
              <Button asChild variant="outline">
                <Link href="/auth/forgot-password">{t("Help")}</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

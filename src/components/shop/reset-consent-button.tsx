"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

const CONSENT_KEY = "cookie-consent";

/** Reset cookie consent state (client) */
export function ResetConsentButton() {
  const t = useT();
  const [resetting, setResetting] = useState(false);

  const handleReset = () => {
    setResetting(true);
    try {
      localStorage.removeItem(CONSENT_KEY);
      toast.success(t("Cookie consent cleared — you'll be asked again on the next visit"));
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error(t("Failed to clear — please check your browser privacy settings"));
    } finally {
      setResetting(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={resetting} onClick={handleReset}>
      <Check className="mr-1.5 h-4 w-4" />
      {resetting ? t("Processing…") : t("Reset cookie consent")}
    </Button>
  );
}

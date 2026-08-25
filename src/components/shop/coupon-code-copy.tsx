"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { useShopLang } from "@/components/shop/lang-provider";
/** 复制Discount码按钮(客户端) */
export function CouponCodeCopy({ code, className }: { code: string; className?: string }) {
  const { t } = useShopLang();

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Coupon code ${code} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("Copy failed — please copy the coupon code manually"));
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleCopy()}
      className={className}
    >
      {copied ? (
        <Check className="mr-1 h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="mr-1 h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

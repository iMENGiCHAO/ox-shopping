"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useShopLang } from "@/components/shop/lang-provider";

export interface QuantityInputProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

/** Quantity stepper — controls within range [min, max] */
export function QuantityInput({
  value,
  min = 1,
  max = 99,
  onChange,
  disabled,
  className,
}: QuantityInputProps) {
  const { t } = useShopLang();
  const clamp = (n: number) => Math.min(Math.max(n, min), max);

  return (
    <div className={cn("inline-flex items-center rounded-lg border border-input bg-card overflow-hidden", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        aria-label={t("Decrease quantity")}
        className="h-9 w-9 rounded-none border-r border-input"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(Number.isNaN(parsed) ? min : clamp(parsed));
        }}
        className="h-9 w-12 bg-transparent text-center text-sm font-normal outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={t("Quantity")}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label={t("Increase quantity")}
        className="h-9 w-9 rounded-none border-l border-input"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

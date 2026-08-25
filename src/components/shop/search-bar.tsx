"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/components/shop/lang-provider";

export interface SearchBarProps {
  placeholder?: string;
  defaultValue?: string;
  className?: string;
  /** dark: used over a dark hero; light: used on a normal page */
  tone?: "dark" | "light";
}

/** Search bar: navigates to /products?q=… on submit */
export function SearchBar({
  placeholder,
  defaultValue,
  className,
  tone = "light",
}: SearchBarProps) {
  const router = useRouter();
  const t = useT();
  const [value, setValue] = useState(defaultValue ?? "");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className={cn("flex w-full items-center", className)}
    >
      <div className="relative w-full">
        <Search
          className={cn(
            "pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2",
            tone === "dark" ? "text-white/60" : "text-muted-foreground",
          )}
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? t("Search products…")}
          aria-label={t("Search products")}
          className={cn(
            "h-9 pl-10 pr-4",
            tone === "dark"
              ? "border-white/25 bg-white/5 text-white placeholder:text-white/50 focus-visible:border-white/70 focus-visible:bg-white/10"
              : "border-input bg-card text-foreground placeholder:text-muted-foreground/60 focus-visible:border-foreground/30",
          )}
        />
      </div>
    </form>
  );
}

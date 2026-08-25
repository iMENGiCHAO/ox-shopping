"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/components/shop/lang-provider";

export interface ProductSortSelectProps {
  value: "newest" | "price_asc" | "price_desc" | "sales";
  className?: string;
}

/** Product sort selector: jumps while keeping current filter params */
export function ProductSortSelect({ value, className }: ProductSortSelectProps) {
  const router = useRouter();
  const t = useT();

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const sp = new URLSearchParams(window.location.search);
        if (v === "newest") sp.delete("sort");
        else sp.set("sort", v);
        sp.delete("page");
        const qs = sp.toString();
        router.push(qs ? `/products?${qs}` : "/products");
      }}
    >
      <SelectTrigger className={className} aria-label={t("Sort by")}>
        <SelectValue placeholder={t("Sort by")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">{t("Featured")}</SelectItem>
        <SelectItem value="sales">{t("Best selling")}</SelectItem>
        <SelectItem value="price_asc">{t("Price: low to high")}</SelectItem>
        <SelectItem value="price_desc">{t("Price: high to low")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

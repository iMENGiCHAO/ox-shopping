"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HeartOff } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { useCurrency } from "@/components/shop/currency-provider";

type FavRow = {
  id: string;
  createdAt: string;
  product: {
    id: string;
    slug: string;
    name: string;
    price: number;
    compareAtPrice: number | null;
    images: string[];
    stock: number;
    status: string;
  };
};

export default function WishlistPage() {
  const t = useT();
  const { format } = useCurrency();
  const [rows, setRows] = useState<FavRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ rows: FavRow[] }>("/api/user/favorites?pageSize=60");
      setRows(d.rows);
    } catch {
      toast.error(t("Failed to load wishlist"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string, productId: string) => {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id)); // 乐观
    try {
      await apiFetch("/api/user/favorites", {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
    } catch {
      setRows(prev);
      toast.error(t("Failed to remove"));
    }
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">…</p>;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{t("My Wishlist")}</h2>
      {rows.length === 0 ? (
        <EmptyState
          icon={<HeartOff className="h-6 w-6" />}
          title={t("Wishlist is empty")}
          description={t("Tap the heart on a product page to save it here.")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.id} className="group relative overflow-hidden rounded-lg border border-border">
              <Link href={`/products/${r.product.slug}`} className="block">
                {r.product.images && r.product.images.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.product.images[0]!}
                    alt={r.product.name}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-secondary" />
                )}
                <div className="p-3">
                  <p className="line-clamp-2 text-xs font-medium">{r.product.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{format(r.product.price)}</p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => void remove(r.id, r.product.id)}
                className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                aria-label={t("Remove from wishlist")}
              >
                <HeartOff className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

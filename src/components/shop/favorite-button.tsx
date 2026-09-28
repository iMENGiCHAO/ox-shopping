"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/fetch-client";
import { useT } from "@/components/shop/lang-provider";
import { cn } from "@/lib/utils";

/** PDP 收藏心形（client 乐观 toggle；未登录跳登录页带回跳） */
export function FavoriteButton({
  productId,
  initial,
  loggedIn,
}: {
  productId: string;
  initial: boolean;
  loggedIn: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!loggedIn) {
      router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    const prev = fav;
    setFav(!prev); // 乐观更新
    try {
      const res = await apiFetch<{ favorited: boolean }>("/api/user/favorites", {
        method: "POST",
        body: JSON.stringify({ productId }),
      });
      setFav(res.favorited);
    } catch {
      setFav(prev); // 失败回滚
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={fav}
      aria-label={t("Add to wishlist")}
      className="shrink-0 p-1.5 text-foreground/50 transition-colors hover:text-foreground"
    >
      <Heart className={cn("h-5 w-5", fav && "fill-current text-foreground")} />
    </button>
  );
}

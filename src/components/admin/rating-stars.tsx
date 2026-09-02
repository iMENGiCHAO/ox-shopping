import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** Read-only star rating component (1-5 stars) */
export interface RatingStarsProps {
  value: number;
  /** Star size in px, default 16 */
  size?: number;
  className?: string;
}

export function RatingStars({ value, size = 16, className }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`评分 ${clamped} 星，共 5 星`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < clamped ? "fill-warning text-warning" : "fill-muted text-muted"}
        />
      ))}
    </div>
  );
}

import { Badge, type BadgeProps } from "@/components/ui/badge";

/** 默认状态文案映射(订单 + 商品状态) */
export const DEFAULT_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending Payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  DRAFT: "Draft",
  ACTIVE: "Active—",
  ARCHIVED: "Archived",
};

/** 默认状态 → Badge 变体映射(info/primary/muted 由 badge.tsx 附加变体支持) */
export const DEFAULT_STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  PENDING_PAYMENT: "warning",
  PAID: "info",
  PROCESSING: "info",
  SHIPPED: "primary",
  DELIVERED: "success",
  CANCELLED: "outline",
  REFUNDED: "destructive",
  DRAFT: "outline",
  ACTIVE: "success",
  ARCHIVED: "muted",
};

export interface StatusBadgeProps {
  /** 状态键(如 PENDING_PAYMENT)，未匹配到映射时直接展示原文 */
  status: string;
  /** 自定义文案映射(单项覆盖默认映射) */
  labelMap?: Record<string, string>;
  /** 自定义变体映射(单项覆盖默认映射；值需为 Badge 支持的 variant) */
  variantMap?: Record<string, BadgeProps["variant"]>;
  className?: string;
}

/**
 * StatusBadge 状态徽章组件：根据状态键自动展示中文文案 + 语义颜色，
 * 可通过 labelMap / variantMap 覆盖单项映射。
 */
export function StatusBadge({ status, labelMap, variantMap, className }: StatusBadgeProps) {
  const label = labelMap?.[status] ?? DEFAULT_STATUS_LABELS[status] ?? status;
  const variant = variantMap?.[status] ?? DEFAULT_STATUS_VARIANTS[status] ?? "secondary";

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

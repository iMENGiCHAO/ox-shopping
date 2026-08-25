/**
 * 管理端共享类型定义(客户端组件使用)
 * 与 src/app/api/admin/** 路由返回的数据结构对齐；
 * Decimal 字段经 JSON 序列化为 string，价格字段统一声明为 string | number。
 */

export type AdminRole = "ADMIN" | "SUPPORT" | "CUSTOMER";
export type AdminUserStatus = "ACTIVE" | "DISABLED";
export type AdminProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type AdminOrderStatus =
  "PENDING_PAYMENT" | "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
export type AdminCouponType = "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
export type AdminRefundStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "REFUNDED";

export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 列表接口统一返回结构 */
export interface AdminListResult<T> {
  data: T[];
  pagination: AdminPagination;
}

/** 分类选项(树形，供 Select 扁平化使用) */
export interface AdminCategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  children?: AdminCategoryOption[];
}

export interface AdminCategory extends AdminCategoryOption {
  slug: string;
  description: string | null;
  image: string | null;
  bannerImage?: string | null;
  sortOrder: number;
  isActive: boolean;
  /** 商品数(接口可能以 _count.products 或 productCount 返回) */
  productCount?: number;
  _count?: { products?: number };
  children: AdminCategory[];
}

export interface AdminCategoryFlat {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: string | number;
  compareAtPrice: string | number | null;
  costPrice: string | number | null;
  stock: number;
  isPresale?: boolean;
  isNew?: boolean;
  isHot?: boolean;
  sizeChart?: { headers: string[]; rows: string[][] } | null;
  /** 规格级库存：{ "Size": { "S": 3 } }，0 = 售罄 */
  specStock?: Record<string, Record<string, number>> | null;
  soldCount: number;
  images: string[];
  description?: string;
  attributes?: { name: string; values: string[]; selectable?: boolean }[];
  status: AdminProductStatus;
  categoryId: string;
  category: { id: string; name: string } | null;
  createdAt?: string;
}

export interface AdminOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  productImage: string | null;
  sku: string;
  price: string | number;
  quantity: number;
  subtotal: string | number;
}

export interface AdminAddressSnapshot {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  userId: string;
  status: AdminOrderStatus;
  subtotal?: string | number;
  shippingFee?: string | number;
  tax?: string | number;
  discount?: string | number;
  total: string | number;
  currency?: string;
  paymentProvider?: string | null;
  trackingCompany?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  addressSnapshot?: AdminAddressSnapshot | null;
  user?: { id?: string; name: string; email: string };
  items?: AdminOrderItem[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: AdminUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  emailVerified?: boolean;
  _count?: { orders?: number };
  orders?: AdminOrder[];
}

export interface AdminCoupon {
  id: string;
  code: string;
  type: AdminCouponType;
  value: string | number;
  minSpend: string | number;
  maxDiscount: string | number | null;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
}

export interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  isHidden: boolean;
  isVerifiedPurchase: boolean;
  images: string[];
  createdAt: string;
  user: { id?: string; name: string; email: string };
  product: { id: string; name: string; images?: string[] };
}

export interface AdminRefund {
  id: string;
  orderId: string;
  userId: string;
  reason: string;
  amount: string | number;
  status: AdminRefundStatus;
  adminNote: string | null;
  createdAt: string;
  order?: { orderNumber: string; total?: string | number };
  user?: { id?: string; name: string; email: string };
}

export interface AdminAuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id?: string; email: string; name: string } | null;
}

export interface AdminSettings {
  siteName: string;
  siteDescription: string;
  contactEmail: string;
  contactPhone: string;
  icp: string;
  seoKeywords: string;
}

/** 上传接口返回 */
export interface AdminUploadPresignResult {
  publicUrl?: string;
  url?: string;
  key?: string;
  fields?: Record<string, string>;
}

export interface AdminUploadResult {
  url?: string;
  publicUrl?: string;
}

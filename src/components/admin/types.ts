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
  nameEn?: string | null;
  parentId: string | null;
  children?: AdminCategoryOption[];
}

export interface AdminCategory extends AdminCategoryOption {
  slug: string;
  description: string | null;
  image: string | null;
  bannerImage?: string | null;
  /** `/collections` 集合卡片图（为空时前端回落到 `image`） */
  cardImage?: string | null;
  sortOrder: number;
  /** 首页横幅次序（1=左，2=右）；null = 不出现在首页横幅 */
  homeSortOrder?: number | null;
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
  nameEn?: string | null;
  slug: string;
  sku: string;
  price: string | number;
  compareAtPrice: string | number | null;
  costPrice: string | number | null;
  stock: number;
  isPresale?: boolean;
  /** 预售提示文案（多语言），覆盖 SiteSetting 默认值。 */
  presaleNoteZh?: string | null;
  presaleNoteEn?: string | null;
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
  /** 有效消费订单数（已支付且非取消/退款） */
  paidOrderCount?: number;
  /** 累计消费（多币种按各订单汇率快照折算 CNY，与仪表盘同口径） */
  paidCny?: number;
  /** 最近一次下单时间（任意状态） */
  lastOrderAt?: string | null;
  /** 该邮箱的到货提醒订阅总数（详情接口返回） */
  notifyMeCount?: number;
  /** 注销申请时间（有值=申请处理中，admin 需处理：确认注销/驳回） */
  deletionRequestedAt?: string | null;
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
  order?: { orderNumber: string; total?: string | number; currency?: string };
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

/** 折扣码类型（与 Prisma CouponType 一致） */
export type AdminCouponType = "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";

/**
 * 后台折扣码行。
 *
 * 金额字段（value / minSpend / maxDiscount）是**基础币种 USD** 的数值——
 * 服务端 serializeCoupon 已把 Prisma Decimal 转成 number，后台不做币种换算，
 * 与 coupon.service 的计算口径保持一致。
 */
export interface AdminCoupon {
  id: string;
  code: string;
  type: AdminCouponType;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  /** 0 = 不限量 */
  usageLimit: number;
  usedCount: number;
  /** 0 = 不限 */
  perUserLimit: number;
  /** 是否在公开领券中心露出 */
  isPublic: boolean;
  title: string | null;
  titleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** 服务端附带的核销笔数（列表页展示用） */
  redemptionCount?: number;
}

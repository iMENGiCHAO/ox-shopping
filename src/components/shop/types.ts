/**
 * 商城前台共享类型与工具函数。
 * 本文件为纯类型 + 纯函数，服务端 / 客户端组件均可安全导入。
 */

/** 商品卡片所需最小字段(兼容服务端 Prisma 序列化与客户端 JSON) */
export interface ProductCardData {
  id: string;
  name: string;
  nameEn?: string | null;
  slug: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  images?: unknown;
  attributes?: unknown;
  soldCount?: number;
  stock: number;
  /** 预售：售罄仍可下单(Pre-Order) */
  isPresale?: boolean;
  /** 运营标签：新品上市 / 热卖 */
  isNew?: boolean;
  isHot?: boolean;
  /** 商品介绍（分享卡内容节选用） */
  description?: string | null;
}

/** 下单规格选择([{ name, value }]，如 颜色=曜石黑) */
export interface SpecSelection {
  name: string;
  value: string;
}

/** 客户端规格去重键(与服务端 specKey 对齐：按名称排序后 JSON 序列化) */
export function specKey(attributes?: SpecSelection[] | null): string {
  if (!attributes || attributes.length === 0) return "";
  return JSON.stringify([...attributes].sort((a, b) => a.name.localeCompare(b.name)));
}

/**
 * 规格展示文案（只取值）：曜石黑 / ABS 塑料。
 *
 * 为什么只取值：原站结账页侧栏显示的是 Shopify 的 variant title——
 * 只列取值、多值用「 / 」连接（实测：商品「The Core Tee」尺寸 M 处只显示「M」，
 * 没有「Size：M」）。购物车/订单同理，故采购链路上统一用这个。
 *
 * 备注：早期还有一个 `formatSpecs`（带选项名、中文全角冒号连接），
 * 全仓库零调用，且会把「：」硬编码进 UI（英文站会泄漏全角标点），已删除。
 * 若将来确实需要在同一行显示「选项名：取值」，请走 shop-i18n 的 `punct(lang)`。
 */
export function formatSpecValues(attributes?: SpecSelection[] | null): string {
  if (!attributes || attributes.length === 0) return "";
  return attributes.map((a) => a.value).join(" / ");
}

/** 收货地址(客户端形态，JSON 序列化后) */
export interface ShopAddress {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  /** 街道地址第二行（公寓/单元号）；结账页写入 */
  line2?: string | null;
  /** 国家/地区 ISO alpha-2；历史地址为 null */
  country?: string | null;
  postalCode?: string | null;
  isDefault: boolean;
  createdAt?: string;
}



/** 取商品图片数组首图(兼容 Prisma Json 序列化结果) */
export function firstImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  return typeof first === "string" && first.length > 0 ? first : null;
}

/** 解析商品规格属性(attributes Json → 结构化数组) */
/** 解析商品规格属性(selectable 表示是否为下单可选规格；soldOutValues 为变体级售罄值) */
export function parseAttributes(
  attributes: unknown,
): { name: string; values: string[]; selectable?: boolean; soldOutValues?: string[] }[] {
  if (!Array.isArray(attributes)) return [];
  const result: { name: string; values: string[]; selectable?: boolean; soldOutValues?: string[] }[] = [];
  for (const item of attributes) {
    if (!item || typeof item !== "object") continue;
    const obj = item as {
      name?: unknown;
      values?: unknown;
      selectable?: unknown;
      soldOutValues?: unknown;
    };
    const name = typeof obj.name === "string" ? obj.name : "";
    const values = Array.isArray(obj.values)
      ? obj.values.filter((v): v is string => typeof v === "string" && v.length > 0)
      : [];
    const soldOutValues = Array.isArray(obj.soldOutValues)
      ? obj.soldOutValues.filter((v): v is string => typeof v === "string" && v.length > 0)
      : undefined;
    if (name && values.length > 0) {
      /* Default: multi-value groups are selectable variants (x.com behaviour),
         single-value groups are informational. Explicit flag always wins. */
      const selectable = obj.selectable === undefined ? values.length > 1 : obj.selectable === true;
      result.push({ name, values, selectable, ...(soldOutValues?.length ? { soldOutValues } : {}) });
    }
  }
  return result;
}

/** 价格转数字(兼容 Prisma Decimal 对象 / 序列化字符串 / 数字) */
export function toNumberPrice(price: unknown): number {
  if (price === null || price === undefined) return 0;
  const n = typeof price === "number" ? price : Number(price);
  return Number.isNaN(n) ? 0 : n;
}

/** 服务端商品行 → ProductCardData(统一 Decimal/JSON 序列化形态) */
export function toCardData<
  T extends {
    id: string;
    name: string;
    nameEn?: string | null;
    slug: string;
    price: unknown;
    compareAtPrice?: unknown;
    images?: unknown;
    attributes?: unknown;
    soldCount?: number;
    stock: number;
    isPresale?: boolean;
    isNew?: boolean;
    isHot?: boolean;
    description?: string | null;
  },
>(p: T): ProductCardData {
  return {
    id: p.id,
    name: p.name,
    nameEn: p.nameEn ?? null,
    slug: p.slug,
    price: toNumberPrice(p.price),
    compareAtPrice: p.compareAtPrice == null ? null : toNumberPrice(p.compareAtPrice),
    images: p.images,
    attributes: p.attributes,
    soldCount: p.soldCount,
    stock: p.stock,
    isNew: p.isNew ?? false,
    isHot: p.isHot ?? false,
    isPresale: p.isPresale ?? false,
    description: p.description ?? null,
  };
}

/**
 * 前台折扣码展示数据。
 *
 * 与 `@/lib/coupon` 的 `CouponView` 刻意保持字段一致：卡片组件按 CouponView
 * 消费，服务端把 Prisma 行转成这个形状（Decimal → number、Date → Date）。
 */
export interface CouponData {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  startsAt: Date;
  endsAt: Date;
  /** 公开券的展示文案（多语，缺失时回落到券码） */
  title: string | null;
  titleEn: string | null;
  description: string | null;
  descriptionEn: string | null;
}

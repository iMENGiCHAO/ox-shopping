import { z } from "zod";

/** 商品(管理端 CRUD) */

/**
 * 图片地址：支持绝对 URL(http/https)或站内相对路径
 * (本地上传返回 /api/uploads/...，S3 返回 http(s) 绝对地址)
 */
export const imageUrlSchema = z
  .string()
  .min(1, "图片地址不能为空")
  .max(2048)
  .refine((v) => v.startsWith("/") || /^https?:\/\//i.test(v), "图片地址不合法");

export const productImageSchema = imageUrlSchema;

export const productAttributeSchema = z.object({
  name: z.string().trim().min(1, "属性名不能为空").max(30),
  values: z.array(z.string().trim().min(1).max(50)).min(1, "至少一个属性值").max(50),
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(2, "商品名称至少 2 个字符").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符")
    .max(150)
    .optional(),
  description: z.string().max(20000).default(""),
  sku: z.string().trim().min(3, "SKU 至少 3 个字符").max(64),
  price: z.number().min(0.01, "价格必须大于 0").max(99999999),
  compareAtPrice: z.number().min(0).max(99999999).nullable().optional(),
  costPrice: z.number().min(0).max(99999999).nullable().optional(),
  stock: z.number().int().min(0, "库存不能为负").max(9999999),
  /// 预售：售罄后仍可下单(Pre-Order)
  isPresale: z.boolean().default(false),
  /// 运营标签：新品上市 / 热卖
  isNew: z.boolean().default(false),
  isHot: z.boolean().default(false),
  /// 尺码参数表 { headers, rows }
  sizeChart: z
    .object({
      headers: z.array(z.string().max(20)).min(2).max(12),
      rows: z.array(z.array(z.string().max(24)).min(1).max(12)).max(30),
    })
    .nullable()
    .optional(),
  /// 规格级库存 { "Size": { "S": 3 } }，0 = 售罄
  specStock: z.record(z.string(), z.record(z.string(), z.number().int().min(0))).nullable().optional(),
  images: z.array(productImageSchema).max(20, "最多 20 张图片").default([]),
  attributes: z.array(productAttributeSchema).max(30).default([]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  categoryId: z.string().min(1, "请选择分类"),
});

export const productUpdateSchema = productCreateSchema.partial().extend({
  sku: z.string().trim().min(3).max(64).optional(),
});

export const productStatusUpdateSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export const batchStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "请选择商品").max(200),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export const stockUpdateSchema = z.object({
  stock: z.number().int().min(0).max(9999999),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** 分类(管理端 CRUD) */

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2, "分类名称至少 2 个字符").max(50),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符")
    .max(100)
    .optional(),
  description: z.string().max(500).optional().nullable(),
  image: imageUrlSchema.optional().nullable(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const categoryReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

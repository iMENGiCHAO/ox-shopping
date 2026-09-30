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

export const productAttributeSchema = z.object({
  name: z.string().trim().min(1, "属性名不能为空").max(30),
  values: z.array(z.string().trim().min(1).max(50)).min(1, "至少一个属性值").max(50),
  /**
   * 是否为「可选规格」组（参与规格选择与组合库存管理）。
   * 不传时由消费方按「多值组默认可选」推断（兼容存量数据）；
   * 显式 false 可把多值组排除出规格选择。
   * ⚠️ 此前 schema 缺这个字段：zod strip 会把表单勾选的 selectable
   * 静默剥掉——单值可选组落库即「消失」，大表保存组合库存时还会把
   * 存量商品的 selectable 信息一并洗掉（大爷 2026-09-29 排查定位）。
   */
  selectable: z.boolean().optional(),
});

/**
 * 规格库存与属性取值一致性校验（P2-1）：specStock 的组名必须对应某个 attribute.name，
 * 组内值必须属于该 attribute.values。仅当两者在同一请求中同时出现时才校验，
 * 避免误伤"分步更新"场景。孤儿组/值会让 aggregateTrackedStock 多算/漏算总库存。
 */
function checkSpecStockConsistency(
  val: {
    specStock?: Record<string, Record<string, number>> | null;
    attributes?: { name: string; values: string[] }[] | null;
    variants?: { attributes: { name: string; value: string }[] }[] | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (val.specStock == null || val.attributes == null) return;

  const attrByName = new Map<string, Set<string>>();
  for (const a of val.attributes) {
    if (!a.name) continue;
    const set = attrByName.get(a.name) ?? new Set<string>();
    for (const v of a.values) set.add(v);
    attrByName.set(a.name, set);
  }

  // 变体一致性（同一请求同时给出 attributes 与 variants 时）：
  // 组合里的组/值必须来自商品属性，否则前台选择器根本无法产生该组合（孤儿变体）
  const variants = (val as { variants?: { attributes: { name: string; value: string }[] }[] })
    .variants;
  if (variants && val.attributes) {
    const seen = new Set<string>();
    for (const [i, v] of variants.entries()) {
      for (const a of v.attributes) {
        const allowed = attrByName.get(a.name);
        if (!allowed || !allowed.has(a.value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["variants", i],
            message: `组合「${a.name}:${a.value}」不在商品属性可选值中`,
          });
        }
      }
      const sig = v.attributes
        .map((a) => `${a.name}:${a.value}`)
        .sort()
        .join("|");
      if (seen.has(sig)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["variants", i],
          message: `组合重复：${v.attributes.map((a) => `${a.name}:${a.value}`).join(" / ")}`,
        });
      }
      seen.add(sig);
    }
  }

  for (const [group, values] of Object.entries(val.specStock)) {
    const attrValues = attrByName.get(group);
    if (!attrValues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specStock", group],
        message: `规格库存的组「${group}」在属性中不存在`,
      });
      continue;
    }
    for (const value of Object.keys(values)) {
      if (!attrValues.has(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["specStock", group, value],
          message: `规格库存的值「${value}」不在属性「${group}」的可选值中`,
        });
      }
    }
  }
}

const productBaseSchema = z.object({
  name: z.string().trim().min(2, "商品名称至少 2 个字符").max(120),
  /// 英文名（可选）：前台英文界面与搜索优先用它；留空回退中文名。仅用于 show/SEO，不作为 slug 必填。
  nameEn: z.string().trim().max(120).nullable().optional(),
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
  /// 预售提示文案（多语言）— 留空 = null，前端会用 SiteSetting.presaleNote 站级默认
  presaleNoteZh: z.string().max(200).nullable().optional(),
  presaleNoteEn: z.string().max(200).nullable().optional(),
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
  specStock: z
    .record(z.string(), z.record(z.string(), z.number().int().min(0)))
    .nullable()
    .optional(),
  /**
   * SKU 矩阵（组合粒度）：每个「颜色×尺码」组合一条，独立库存。
   * 非空时前台只列真实存在的组合（解决「不同颜色有不同尺码」时顾客选到不存在组合）。
   * 传空数组 = 清空回落到 specStock 维度池模式。
   */
  variants: z
    .array(
      z.object({
        attributes: z
          .array(z.object({ name: z.string().trim().min(1), value: z.string().trim().min(1) }))
          .min(1, "组合至少需要一个属性")
          .max(4),
        stock: z.number().int().min(0).max(1_000_000),
        /**
         * 乐观锁（2026-09-30 商用审计 P1-1）：表单/大表**加载时**的该组合库存快照。
         * 服务端在 products 行锁内与库内现值比对——不一致（期间有下单扣减/其他
         * 编辑）→ 409 拒绝保存，杜绝「快照复活已卖库存→超卖」。null/缺省 =
         * 新增组合或旧客户端兼容（跳过比对）。
         */
        expectedStock: z.number().int().min(0).max(1_000_000).nullable().optional(),
        price: z.number().min(0).nullable().optional(),
        sku: z.string().trim().max(64).nullable().optional(),
        image: z.string().max(500).nullable().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .max(500, "组合数不能超过 500")
    .optional(),
  images: z.array(imageUrlSchema).max(20, "最多 20 张图片").default([]),
  attributes: z.array(productAttributeSchema).max(30).default([]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  categoryId: z.string().min(1, "请选择分类"),
});

export const productCreateSchema = productBaseSchema.superRefine(checkSpecStockConsistency);

export const productUpdateSchema = productBaseSchema
  .partial()
  .extend({
    sku: z.string().trim().min(3).max(64).optional(),
  })
  .superRefine(checkSpecStockConsistency);

export const productStatusUpdateSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export const batchStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "请选择商品").max(200),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

/** 批量删除：与单删同语义（物理删除，购物车级联清理，订单保留快照） */
export const batchDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "请选择商品").max(200),
});

export const stockUpdateSchema = z.object({
  stock: z.number().int().min(0).max(9999999),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** 分类(管理端 CRUD) */

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2, "分类名称至少 2 个字符").max(50),
  nameEn: z.string().trim().max(100).optional().nullable(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符")
    .max(100)
    .optional(),
  description: z.string().max(500).optional().nullable(),
  image: imageUrlSchema.optional().nullable(),
  bannerImage: imageUrlSchema.optional().nullable(),
  /** `/collections` 集合卡片图（为空时前端回落到 `image`） */
  cardImage: imageUrlSchema.optional().nullable(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
  /**
   * 首页横幅次序（1=左，2=右）。`null` = 不出现在首页横幅。
   * 与 `sortOrder`（/collections 陈列顺序）解耦，因为原站两者顺序不同。
   */
  homeSortOrder: z.number().int().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const categoryReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

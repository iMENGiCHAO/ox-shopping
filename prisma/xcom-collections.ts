/**
 * shop.x.com 的「集合」定义 —— **手写维护**（非自动生成）。
 *
 * 为什么单独一个文件：`xcom-catalog.ts` 由 `scripts/gen-xcom-seed.cjs` 从官方
 * `/products.json` 生成，而 Shopify 的「collection」与「product_type」是两个概念 ——
 * `/products.json` 只带 product_type（对应本站的**主分类** `x-collection` /
 * `spacexai-collection`），拿不到 Mens / Womens 这类**手工集合**。
 * 因此集合清单与成员关系在此手写，数据来源为原站实测截图：
 *
 *   /collections             → 4 个集合，顺序 Mens → SpaceXAI Collection → Womens → X Collection
 *                              （3 列网格，第二行仅 1 个，左对齐）
 *   /collections/mens        → 15 件商品（见下 `MENS_MEMBERS`，按原站陈列顺序）
 *   /collections/womens      → 与 Mens 内容一致（原站两者重复）
 *
 * ⚠️ 原站同一件商品可同时属于多个集合 —— 例如 `Grok Logo Tee` 既在 Mens，
 * 其 product_type 又是 xAI 线。单一 `Product.categoryId` 表达不了，故引入
 * `ProductCollection` 多对多表（见 schema.prisma）。归属判定 =
 * 「主分类命中」∪「本表存在成员行」，统一收敛在 `product.service.ts`。
 */

export interface CollectionSeed {
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  /** 首页横幅图（首页两块半宽横幅取此图） */
  image: string;
  /** `/collections` 集合卡片图（灰底商品图；为空时回落 `image`） */
  cardImage?: string;
  /** 集合顺序 —— 原站 /collections 的陈列顺序，seed 视其为权威 */
  sortOrder: number;
  /**
   * 首页横幅次序（1=左，2=右）。留空 = 不出现在首页横幅。
   *
   * 与 `sortOrder` 分开的原因：原站首页横幅是 `[ X Collection ]` +
   * `[ SpaceXAI Collection ]`，而 /collections 顺序是
   * `Mens · SpaceXAI Collection · Womens · X Collection` —— 两者不同。
   */
  homeSortOrder?: number;
  /**
   * 成员商品 slug（按原站陈列顺序）。
   * 留空表示「成员 = 以本集合为主分类的全部商品」，无需逐条维护。
   */
  productSlugs: string[];
}

/**
 * Mens 成员 —— 原站 `/collections/mens` 实测顺序（1200 视口整页截图）。
 * Womens 内容与原站完全一致，故复用同一份清单。
 */
const MENS_MEMBERS = [
  "x-icon-t-shirt", // The Core Tee
  "x-embroidery-trucker-cap", // The Core Trucker Hat
  "unisex-retro-x-com-crewneck-pre-sale", // The Retro Crewneck
  "unisex-retro-x-com-short-sleeve-tee-pre-sale", // The Retro Tee
  "unisex-3d-x-logo-hoodie", // The Core Hoodie
  "grok-logo-tee", // Grok Logo Tee
  "grok-logo-tee-copy-1", // xAI Logo Tee
  "the-xai-hoodie", // The xAI Hoodie
  "xai-dad-hat", // xAI Dad Hat
  "xai-dad-hat-copy", // Grok Dad Hat
  "xai-trucker-hat", // xAI Trucker Hat
  "grok-trucker-hat", // Grok Trucker Hat
  "the-grok-hoodie", // The Grok Hoodie
  "xai-human-connection-tee", // xAI Human Connection Tee
  "xai-dark-ani-tee", // xAI Dark Ani Tee
] as const;

export const xcomCollections: CollectionSeed[] = [
  {
    name: "Mens",
    nameEn: "Mens",
    slug: "mens",
    description: "Mens collection",
    image: "/images/xcom2/banner-x.jpg",
    cardImage: "/images/xcom2/x-icon-t-shirt-0.jpg",
    sortOrder: 1,
    productSlugs: [...MENS_MEMBERS],
  },
  {
    name: "SpaceXAI Collection",
    nameEn: "SpaceXAI Collection",
    slug: "spacexai-collection",
    description: "Official SpaceXAI collection",
    image: "/images/xcom2/banner-xai.jpg",
    cardImage: "/images/xcom2/macrohard-rugby-shirt-0.jpg",
    sortOrder: 2,
    homeSortOrder: 2,
    // 成员 = 主分类为 spacexai-collection 的全部商品
    productSlugs: [],
  },
  {
    name: "Womens",
    nameEn: "Womens",
    slug: "womens",
    description: "Womens collection",
    image: "/images/xcom2/banner-x.jpg",
    cardImage: "/images/xcom2/x-icon-t-shirt-0.jpg",
    sortOrder: 3,
    productSlugs: [...MENS_MEMBERS],
  },
  {
    name: "X Collection",
    nameEn: "X Collection",
    slug: "x-collection",
    description: "Official X collection",
    image: "/images/xcom2/banner-x.jpg",
    cardImage: "/images/xcom2/the-core-x-crewneck-0.jpg",
    sortOrder: 4,
    homeSortOrder: 1,
    // 成员 = 主分类为 x-collection 的全部商品
    productSlugs: [],
  },
];

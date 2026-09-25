/**
 * 演示「集合」定义 —— 与 demo-catalog.ts 配套的手写清单（中性虚构品牌）。
 *
 * 集合与主分类是两个概念：主分类表达商品归属线（Ox Collection /
 * Ox Essentials Collection），集合是运营维度（Mens / Womens）。
 * 同一商品可同时属于多个集合 —— `Product.categoryId` 表达不了多对多，
 * 故有 `ProductCollection` 表（见 schema.prisma）。归属判定 =
 * 「主分类命中」∪「本表存在成员行」，统一收敛在 `product.service.ts`。
 */

export interface CollectionSeed {
  name: string;
  nameEn: string;
  slug: string;
  description: string;
  /** 首页横幅图（首页两块半宽横幅取此图） */
  image: string;
  /** `/collections` 集合卡片图；为空时回落 `image` */
  cardImage?: string;
  /** 集合顺序 */
  sortOrder: number;
  /** 首页横幅次序（1=左，2=右）。留空 = 不出现在首页横幅。 */
  homeSortOrder?: number;
  /**
   * 成员商品 slug。
   * 留空表示「成员 = 以本集合为主分类的全部商品」，无需逐条维护。
   */
  productSlugs: string[];
}

/** Mens 成员（演示陈列顺序；Womens 与 Mens 内容一致，复用同一份清单） */
const MENS_MEMBERS = [
  "ox-core-tee",
  "ox-core-trucker-hat",
  "ox-retro-crewneck-presale",
  "ox-retro-tee-presale",
  "ox-core-hoodie",
  "ox-graphic-logo-tee",
  "ox-logo-tee",
  "ox-classic-hoodie",
  "ox-classic-dad-hat",
  "ox-dad-hat",
  "ox-classic-trucker-hat",
  "ox-trucker-hat",
  "ox-hoodie",
  "ox-human-connection-tee",
  "ox-midnight-graphic-tee",
] as const;

export const demoCollections: CollectionSeed[] = [
  {
    name: "Mens",
    nameEn: "Mens",
    slug: "mens",
    description: "Mens collection",
    image: "/images/demo/banner-ox.jpg",
    cardImage: "/images/demo/ox-core-tee-0.jpg",
    sortOrder: 1,
    productSlugs: [...MENS_MEMBERS],
  },
  {
    name: "Ox Essentials Collection",
    nameEn: "Ox Essentials Collection",
    slug: "ox-essentials-collection",
    description: "Ox everyday essentials",
    image: "/images/demo/banner-ox-essentials.jpg",
    cardImage: "/images/demo/ox-rugby-shirt-0.jpg",
    sortOrder: 2,
    homeSortOrder: 2,
    // 成员 = 主分类为 ox-essentials-collection 的全部商品
    productSlugs: [],
  },
  {
    name: "Womens",
    nameEn: "Womens",
    slug: "womens",
    description: "Womens collection",
    image: "/images/demo/banner-ox.jpg",
    cardImage: "/images/demo/ox-core-tee-0.jpg",
    sortOrder: 3,
    productSlugs: [...MENS_MEMBERS],
  },
  {
    name: "Ox Collection",
    nameEn: "Ox Collection",
    slug: "ox-collection",
    description: "Ox signature collection",
    image: "/images/demo/banner-ox.jpg",
    cardImage: "/images/demo/ox-core-crewneck-0.jpg",
    sortOrder: 4,
    homeSortOrder: 1,
    // 成员 = 主分类为 ox-collection 的全部商品
    productSlugs: [],
  },
];

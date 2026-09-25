/* eslint-disable no-console */
/**
 * 种子数据：管理员、测试用户、支持人员、分类、商品
 * 幂等设计：重复执行不会产生重复数据（upsert）。
 * 运行：npm run db:seed
 *
 * 商品与分类目录 = prisma/demo-catalog.ts（中性虚构品牌 Ox Essentials，
 * 演示图由 scripts/gen-demo-images.mjs 生成 —— 无任何第三方商标，可安全用于演示）。
 */
import "dotenv/config";
import { PrismaClient, Prisma, Role, ProductStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { demoCategories, demoProducts } from "./demo-catalog";
import { demoCollections } from "./demo-collections";
import { FAQ_DEFAULTS } from "../src/lib/faq-defaults";

const prisma = new PrismaClient();

async function seedUsers() {
  const passwordHash = await bcrypt.hash("Admin@123456", 12);
  const customerHash = await bcrypt.hash("User@123456", 12);
  const supportHash = await bcrypt.hash("Support@123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      name: "系统管理员",
      role: Role.ADMIN,
      emailVerified: true,
      status: "ACTIVE",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "user@example.com" },
    update: {},
    create: {
      email: "user@example.com",
      passwordHash: customerHash,
      name: "测试用户",
      role: Role.CUSTOMER,
      emailVerified: true,
      status: "ACTIVE",
    },
  });

  const support = await prisma.user.upsert({
    where: { email: "support@example.com" },
    update: {},
    create: {
      email: "support@example.com",
      passwordHash: supportHash,
      name: "客服小二",
      role: Role.SUPPORT,
      emailVerified: true,
      status: "ACTIVE",
    },
  });

  // 测试用户默认收货地址
  await prisma.address.upsert({
    where: { id: "seed-address-1" },
    update: {},
    create: {
      id: "seed-address-1",
      userId: user.id,
      recipientName: "测试用户",
      phone: "13800138000",
      province: "广东省",
      city: "深圳市",
      district: "南山区",
      detail: "科技园南路 1 号 88 栋 8801 室",
      isDefault: true,
    },
  });

  console.log("✓ 用户与地址创建完成");
  return { admin, user, support };
}

async function seedCategories() {
  // 一致性守卫：`demo-catalog.ts` 是商品主目录，
  // `demo-collections.ts` 是手写集合清单。若目录里出现手写清单未收录的分类，
  // 说明目录新增了分类而清单没跟上 —— 直接报错，避免静默漏掉集合。
  const missing = demoCategories.filter((c) => !demoCollections.some((k) => k.slug === c.slug));
  if (missing.length > 0) {
    throw new Error(
      `prisma/demo-collections.ts 缺少分类定义：${missing.map((c) => c.slug).join(", ")}` +
        `（目录新增了分类，请同步手写集合清单）`,
    );
  }

  const map = new Map<string, string>();
  for (const cat of demoCollections) {
    /* 这 4 个集合是**导航结构**，
       seed 视 `demo-collections.ts` 为权威并同步名称/顺序/图片 ——
       否则历史改名会让 /collections 与目录不一致，且换机器重新部署无法复现。
       运营若要自定义，请**新增**集合而不是改这 4 个。
       唯一保留的运营字段：`isActive`（下架集合）与 `parentId`。 */
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        nameEn: cat.nameEn,
        description: cat.description,
        image: cat.image,
        cardImage: cat.cardImage ?? null,
        sortOrder: cat.sortOrder,
        homeSortOrder: cat.homeSortOrder ?? null,
      },
      create: {
        name: cat.name,
        nameEn: cat.nameEn,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
        cardImage: cat.cardImage ?? null,
        sortOrder: cat.sortOrder,
        homeSortOrder: cat.homeSortOrder ?? null,
      },
    });
    map.set(cat.slug, row.id);
  }
  console.log(`✓ 分类创建完成（${demoCollections.length} 个）`);
  return map;
}

/**
 * 集合成员种子（幂等）。
 *
 * 原站一件商品可同时属于多个集合，`Product.categoryId` 只能存一个，
 * 因此「附加归属」落 `product_collections`：
 *   - `productSlugs` 非空的集合（Mens / Womens）→ 逐条 upsert 成员行，
 *     `sortOrder` 取数组下标（= 原站陈列顺序）；
 *   - `productSlugs` 为空的集合（Ox Essentials / Ox Collection）→ 成员由主分类决定，
 *     无需成员行；此处顺手清理历史遗留的冗余行，避免双写。
 *
 * 只补不删商品：缺失的 slug 记 warning 而不抛错（目录可能被运营下架过）。
 */
async function seedCollectionMembers(categoryMap: Map<string, string>) {
  let created = 0;
  for (const col of demoCollections) {
    const categoryId = categoryMap.get(col.slug);
    if (!categoryId) continue;

    if (col.productSlugs.length === 0) {
      // 成员由主分类决定 —— 清掉本集合下「主分类另有其人」的冗余成员行
      const removed = await prisma.productCollection.deleteMany({
        where: { categoryId, product: { categoryId: { not: categoryId } } },
      });
      if (removed.count > 0) {
        console.log(`  · ${col.slug}：清理冗余成员行 ${removed.count} 条`);
      }
      continue;
    }

    for (const [index, slug] of col.productSlugs.entries()) {
      const product = await prisma.product.findUnique({
        where: { slug },
        select: { id: true, categoryId: true },
      });
      if (!product) {
        console.warn(`  ⚠️ ${col.slug}：成员商品不存在，跳过 → ${slug}`);
        continue;
      }
      // 主分类已命中的商品无需成员行（归属判定取并集）
      if (product.categoryId === categoryId) continue;

      const row = await prisma.productCollection.upsert({
        where: { productId_categoryId: { productId: product.id, categoryId } },
        update: { sortOrder: index },
        create: { productId: product.id, categoryId, sortOrder: index },
      });
      if (row.createdAt.getTime() > Date.now() - 5000) created++;
    }
  }
  console.log(`✓ 集合成员创建完成（新增 ${created} 条归属）`);
}

async function seedProducts(categoryMap: Map<string, string>) {
  const existingCount = await prisma.product.count();
  if (existingCount > 0 && process.env.FORCE_RESEED !== "true") {
    console.log(
      `⏭ 已存在 ${existingCount} 个商品，跳过目录种子（不覆盖运营数据；如需重建请显式设置 FORCE_RESEED=true）`,
    );
    return;
  }
  if (process.env.FORCE_RESEED === "true") {
    console.log("⚠️ FORCE_RESEED=true：清空并重建商品目录（仅限开发环境使用！）");
    await prisma.product.deleteMany({});
  }
  // 演示首页陈列顺序（沿用中性目录上线时的排序）
  const HOME_ORDER = [
    "ox-multi-tumbler",
    "ox-hydration-vessel",
    "ox-reflective-tee",
    "ox-kids-constellation-tee",
    "ox-kids-constellation-hoodie",
    "ox-thermal-beanie",
    "ox-everything-mug",
    "ox-human-connection-tee",
    "ox-midnight-graphic-tee",
    "ox-constellation-tee",
    "ox-graphic-logo-tee",
    "ox-logo-tee",
    "ox-classic-trucker-hat",
    "ox-classic-hoodie",
    "ox-classic-dad-hat",
    "ox-trucker-hat",
    "ox-hoodie",
    "ox-dad-hat",
    "ox-retro-tee-presale",
    "ox-retro-crewneck-presale",
    "ox-core-crewneck",
    "ox-ribbed-beanie",
    "ox-signature-crew-sock-set",
    "ox-core-trucker-hat",
    "ox-core-tee",
    "ox-core-hoodie",
    "ox-core-dad-hat",
  ];
  let created = 0;
  for (const p of demoProducts) {
    const categoryId = categoryMap.get(p.categorySlug);
    if (!categoryId) throw new Error(`分类不存在：${p.categorySlug}`);
    // createdAt 编码官方首页陈列顺序（sort=newest 还原）；未上列表页的商品排最后
    const rank = HOME_ORDER.indexOf(p.slug);
    const createdAt = new Date(
      Date.now() - (rank >= 0 ? rank : 100 + Number(p.slug.length)) * 60_000,
    );
    // 幂等且非破坏：缺失才创建，绝不覆盖既有商品的库存/价格/图片
    const row = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        nameEn: p.nameEn,
        slug: p.slug,
        sku: p.sku,
        description: p.description,
        descriptionEn: p.description,
        price: p.price,
        stock: p.stock,
        soldCount: p.soldCount,
        isPresale: p.isPresale,
        images: p.images,
        attributes: p.attributes,
        categoryId,
        status: ProductStatus.ACTIVE,
        createdAt,
        updatedAt: createdAt,
      },
    });
    if (row.createdAt.getTime() === createdAt.getTime()) created++;
  }

  console.log(
    `✓ 商品创建完成（新建 ${created} 个 / 目录 ${demoProducts.length} 个，既有数据未覆盖）`,
  );
}

/** 物流方式种子（幂等）：后台可编辑，测试与演示环境依赖 standard/express */
async function seedShippingMethods() {
  const methods = [
    {
      code: "standard",
      name: "标准快递",
      nameEn: "Standard",
      description: "3-5 个工作日送达",
      descriptionEn: "Delivery in 3-5 business days",
      fee: 10,
      freeOver: 200,
      isCashOnDelivery: false,
      sortOrder: 1,
      etaZh: "3-5 个工作日",
      etaEn: "3-5 business days",
    },
    {
      code: "express",
      name: "次日达",
      nameEn: "Express",
      description: "1-2 个工作日加急送达",
      descriptionEn: "Express delivery in 1-2 business days",
      fee: 25,
      freeOver: 500,
      isCashOnDelivery: false,
      sortOrder: 2,
      etaZh: "1-2 个工作日",
      etaEn: "1-2 business days",
    },
    {
      code: "cod",
      name: "货到付款",
      nameEn: "Cash on Delivery",
      description: "签收时向快递员付款（运费另计）",
      descriptionEn: "Pay on delivery (shipping fee collected separately)",
      fee: 0,
      freeOver: 0,
      isCashOnDelivery: true,
      sortOrder: 3,
      etaZh: "3-5 个工作日",
      etaEn: "3-5 business days",
    },
  ];
  for (const m of methods) {
    await prisma.shippingMethod.upsert({
      where: { code: m.code },
      update: {}, // 不覆盖后台已编辑内容
      create: m,
    });
  }
  console.log("✓ 物流方式初始化完成（standard / express / cod）");
}

async function seedSiteSettings() {
  const defaults: Record<string, unknown> = {
    siteName: "Ox Shopping",
    siteDescription: "Official Ox Shopping — official apparel and accessories.",
    // 客服联系方式从环境变量取（SUPPORT_EMAIL / SUPPORT_PHONE），不再往库里塞
    // `support@example.com` / `400-000-0000` 这类占位值 —— 它们会被 FAQ、发票、
    // 「您的隐私选择」页直接引用并展示给真实客户。上线前请在后台「站点设置」填写。
    contactEmail: process.env.SUPPORT_EMAIL ?? "",
    contactPhone: process.env.SUPPORT_PHONE ?? "",
    icp: "",
    seoKeywords: "Ox Shopping,Ox,shop,apparel",
  };
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.siteSetting.upsert({
      where: { key },
      // 仅缺失时创建：绝不覆盖后台已编辑的站点设置/横幅/法务内容
      update: {},
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }
  console.log("✓ 站点设置初始化完成");
}

/**
 * 支付渠道：全部内置渠道预留（大爷需求：支付账户未申请，先建好渠道，后台填参数即用）。
 * - mock：开发/演示必需，开箱即用（启用）。
 * - alipay/wechat/bankcard/stripe/paypal：预留（未配置/未启用）——
 *   申请到账户后在后台「支付渠道」填参数并启用；前台在接通前显示「暂未开通」置灰。
 * 密钥加密用 PAYMENT_CHANNEL_ENC_KEY；未配置时回退开发默认值（与 migrate 脚本一致）。
 */
async function seedPaymentChannels() {
  const { encryptConfig } = await import("../src/lib/payment/channel-crypto-core");
  const key = process.env.PAYMENT_CHANNEL_ENC_KEY || "dev-payment-channel-enc-key-change-me";
  const builtin = [
    { code: "mock", name: "模拟支付", provider: "mock", enabled: true, sortOrder: 0 },
    { code: "alipay", name: "支付宝", provider: "alipay", enabled: false, sortOrder: 10 },
    { code: "wechat", name: "微信支付", provider: "wechat", enabled: false, sortOrder: 20 },
    { code: "bankcard", name: "银行卡支付", provider: "bankcard", enabled: false, sortOrder: 30 },
    { code: "stripe", name: "Stripe", provider: "stripe", enabled: false, sortOrder: 40 },
    { code: "paypal", name: "PayPal", provider: "paypal", enabled: false, sortOrder: 50 },
  ] as const;
  for (const ch of builtin) {
    // 幂等：已存在的渠道（含已配置的密钥/启用状态）一律不动
    await prisma.paymentChannel.upsert({
      where: { code: ch.code },
      update: {},
      create: { ...ch, configEncrypted: encryptConfig(key, {}) },
    });
  }
  console.log(
    "✓ 支付渠道初始化完成（模拟支付已启用；支付宝/微信/银行卡/Stripe/PayPal 已预留待配置）",
  );
}

/**
 * FAQ 入库 —— 让「FAQ 管理」后台可编辑，同时保证内容不只存在于某个开发库里。
 *
 * 为什么需要它：`/pages/faqs` 是「先读库、库空才回落 `FAQ_DEFAULTS`」，
 * 而此前**没有任何种子或迁移往 `faqs` 表写数据** —— 库里的内容来自一次性手工插入，
 * 结果是仓库里的 `FAQ_DEFAULTS` 与库里的文案各自漂移。
 *
 * 规则（幂等，且**绝不覆盖运营在后台的编辑**）：
 *   - 表为空 → 全量写入 `FAQ_DEFAULTS`
 *   - 表非空 → 只回写「从未被编辑过」的行（`updatedAt` 与 `createdAt` 相等，
 *     即仍是写入时的原样）中、与 `FAQ_DEFAULTS` 同 `sortOrder` 但文案已过期的那些
 */
async function seedFaqs() {
  const existing = await prisma.faq.findMany({
    select: {
      id: true,
      sortOrder: true,
      question: true,
      answer: true,
      questionEn: true,
      answerEn: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (existing.length === 0) {
    await prisma.faq.createMany({
      data: FAQ_DEFAULTS.map((f, i) => ({
        question: f.question,
        answer: f.answer,
        questionEn: f.questionEn,
        answerEn: f.answerEn,
        sortOrder: i,
        published: true,
      })),
    });
    console.log(`✓ FAQ 初始化完成（写入 ${FAQ_DEFAULTS.length} 条）`);
    return;
  }

  const bySortOrder = new Map(existing.map((r) => [r.sortOrder, r]));
  let updated = 0;
  let kept = 0;

  for (const [i, f] of FAQ_DEFAULTS.entries()) {
    const row = bySortOrder.get(i);
    if (!row) continue;
    const same =
      row.question === f.question &&
      row.answer === f.answer &&
      row.questionEn === f.questionEn &&
      row.answerEn === f.answerEn;
    if (same) continue;
    // updatedAt 被 @updatedAt 维护：与 createdAt 相等 ⇒ 后台从未改过这一行
    const untouched = row.updatedAt.getTime() === row.createdAt.getTime();
    if (!untouched) {
      kept++;
      continue;
    }
    await prisma.faq.update({
      where: { id: row.id },
      data: {
        question: f.question,
        answer: f.answer,
        questionEn: f.questionEn,
        answerEn: f.answerEn,
      },
    });
    updated++;
  }

  console.log(
    `✓ FAQ 同步完成（库中 ${existing.length} 条：回写 ${updated} 条、保留运营编辑 ${kept} 条）`,
  );
}

/**
 * 分销启用基线（**仅测试库**）。
 *
 * 为什么需要：`getDistributionEnabledAt()` 在 SiteSetting 缺失时把**首次调用时刻**
 * 记为基线，而 `reconcileDistribution` 会把「早于基线的订单」视为自然单、不补归属。
 * 集成测试若在基线写入之前创建订单（清空测试库后的首轮就是如此），这些订单就永远
 * 补不回归属 —— 表现为「对账补偿」用例随库状态时绿时红，极难定位。
 * 预置一个很早的基线，让测试订单始终晚于它。
 *
 * ⚠️ 只在测试库写入：生产/开发库的真实启用时刻必须由运行时决定，
 *   否则历史订单会被错误地回溯归属（那是真实的资金口径问题）。
 */
async function seedDistributionBaseline() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) return;

  const KEY = "distributionEnabledAt";
  const existing = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  if (existing) return;

  await prisma.siteSetting.create({
    data: { key: KEY, value: new Date("2020-01-01T00:00:00.000Z").toISOString() },
  });
  console.log("✓ 测试库分销启用基线已预置（2020-01-01，避免对账补归属被时间窗吞掉）");
}

async function main() {
  console.log("开始写入种子数据...");
  // 演示账号门控：生产环境默认跳过（admin@example.com 等已知口令绝不入生产库）。
  // 需要时显式设置 SEED_DEMO_ACCOUNTS=true（仅限演示/测试环境！）。
  const seedDemo =
    process.env.SEED_DEMO_ACCOUNTS === "true" ||
    (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_ACCOUNTS !== "false");
  if (seedDemo) {
    await seedUsers();
  } else {
    console.log("⏭ 跳过演示账号种子（生产模式：SEED_DEMO_ACCOUNTS 未显式开启）");
    console.log("⚠️ 生产环境请用 `npm run admin:create -- <email>` 创建首个管理员");
  }
  const categoryMap = await seedCategories();
  await seedProducts(categoryMap);
  await seedCollectionMembers(categoryMap);
  await seedShippingMethods();
  await seedSiteSettings();
  await seedFaqs();
  await seedPaymentChannels();
  await seedDistributionBaseline();
  console.log("种子数据全部完成 ✔");
  if (seedDemo) {
    console.log("  管理员: admin@example.com / Admin@123456");
    console.log("  用户:   user@example.com / User@123456");
    console.log("  客服:   support@example.com / Support@123456");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

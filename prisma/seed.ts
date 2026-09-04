/* eslint-disable no-console */
/**
 * 种子数据：管理员、测试用户、支持人员、分类、商品、优惠券、评价
 * 幂等设计：重复执行不会产生重复数据（upsert）。
 * 运行：npm run db:seed
 *
 * 商品与分类目录 = shop.x.com 官方商店的完整镜像（prisma/xcom-catalog.ts，
 * 由 scripts/gen-xcom-seed.cjs 从官方 /products.json 生成）。
 */
import "dotenv/config";
import { PrismaClient, Prisma, Role, ProductStatus, CouponType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { xcomCategories, xcomProducts } from "./xcom-catalog";

const prisma = new PrismaClient();

const now = new Date();
const in30d = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
const in90d = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

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
  const map = new Map<string, string>();
  for (const cat of xcomCategories) {
    // 非破坏性：已存在的分类不做覆盖（保护后台编辑过的名称/图片）
    const row = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: {
        name: cat.name,
        nameEn: cat.nameEn,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
        sortOrder: cat.sortOrder,
      },
    });
    map.set(cat.slug, row.id);
  }
  console.log(`✓ 分类创建完成（${xcomCategories.length} 个）`);
  return map;
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
  // 官方首页陈列顺序（2026-08 实测 /shop.x.com frontpage）
  const HOME_ORDER = [
    "xai-multi-tumbler",
    "xai-vessel",
    "hardcore-grok-reflective-tee",
    "kids-grok-to-understand-tee",
    "kids-grok-to-understand-tee-copy",
    "xai-thermal-beanie",
    "x-the-everything-mug",
    "xai-human-connection-tee",
    "xai-dark-ani-tee",
    "grok-logo-tee-copy",
    "grok-logo-tee",
    "grok-logo-tee-copy-1",
    "xai-trucker-hat",
    "the-xai-hoodie",
    "xai-dad-hat",
    "grok-trucker-hat",
    "the-grok-hoodie",
    "xai-dad-hat-copy",
    "unisex-retro-x-com-short-sleeve-tee-pre-sale",
    "unisex-retro-x-com-crewneck-pre-sale",
    "the-core-x-crewneck",
    "x-beanie",
    "x-signature-crew-sock-set",
    "x-embroidery-trucker-cap",
    "x-icon-t-shirt",
    "unisex-3d-x-logo-hoodie",
    "unisex-3d-logo-dad-hat",
  ];
  let created = 0;
  for (const p of xcomProducts) {
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
    `✓ 商品创建完成（新建 ${created} 个 / 目录 ${xcomProducts.length} 个，既有数据未覆盖）`,
  );
}

async function seedCoupons() {
  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      code: "WELCOME10",
      type: CouponType.PERCENTAGE,
      value: 10,
      minSpend: 100,
      maxDiscount: 200,
      startsAt: now,
      endsAt: in90d,
      usageLimit: 0,
      isActive: true,
    },
  });

  await prisma.coupon.upsert({
    where: { code: "SAVE50" },
    update: {},
    create: {
      code: "SAVE50",
      type: CouponType.FIXED,
      value: 50,
      minSpend: 300,
      startsAt: now,
      endsAt: in90d,
      usageLimit: 500,
      isActive: true,
    },
  });

  await prisma.coupon.upsert({
    where: { code: "FREESHIP" },
    update: {},
    create: {
      code: "FREESHIP",
      type: CouponType.FREE_SHIPPING,
      value: 0,
      minSpend: 99,
      startsAt: now,
      endsAt: in30d,
      usageLimit: 1000,
      isActive: true,
    },
  });

  console.log("✓ 优惠券创建完成（WELCOME10 九折 / SAVE50 满300减50 / FREESHIP 免运费）");
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
    contactEmail: "support@example.com",
    contactPhone: "400-000-0000",
    icp: "",
    seoKeywords: "Ox Shopping,Grok,X,shop,apparel",
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
  await seedShippingMethods();
  if (process.env.NODE_ENV !== "production" || seedDemo) {
    await seedCoupons();
  } else {
    console.log("⏭ 跳过优惠券种子（生产环境：由运营后台创建）");
  }
  await seedSiteSettings();
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

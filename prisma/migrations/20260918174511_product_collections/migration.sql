-- 商品 ↔ 集合 多对多归属。
--
-- 背景：shop.x.com 的 collection 与 product_type 是两个概念。原站 /collections 有 4 个集合
-- （Mens / SpaceXAI Collection / Womens / X Collection），且同一件商品可同时属于多个
-- （实测 /collections/mens 里既有 X 线的 The Core Tee，也有 xAI 线的 Grok Logo Tee）。
-- 单一 products."categoryId" 只能表达一个归属，故新增本表承载附加归属；
-- 归属判定 = 「主分类命中」∪「本表存在成员行」，统一在 product.service.ts 收敛。

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "cardImage" TEXT;

-- CreateTable
CREATE TABLE "product_collections" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_collections_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateIndex
CREATE INDEX "product_collections_categoryId_sortOrder_idx" ON "product_collections"("categoryId", "sortOrder");

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collections" ADD CONSTRAINT "product_collections_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

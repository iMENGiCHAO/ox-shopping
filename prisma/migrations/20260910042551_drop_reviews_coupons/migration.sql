-- 精简：删除 shop.x.com 原站没有的冗余功能（商品评价 Review + 优惠券 Coupon）
DROP TABLE IF EXISTS "reviews" CASCADE;
DROP TABLE IF EXISTS "coupon_redemptions" CASCADE;
DROP TABLE IF EXISTS "coupons" CASCADE;

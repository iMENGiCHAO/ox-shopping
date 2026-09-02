-- 分类落地页全宽横幅列（历史经 db push 引入，补录进版本化迁移）
ALTER TABLE "categories" ADD COLUMN "bannerImage" TEXT;

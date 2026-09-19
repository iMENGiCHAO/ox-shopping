-- 首页横幅顺序（与 /collections 的陈列顺序解耦）。
--
-- 原站首页两块半宽横幅是 `[ X Collection ]` + `[ SpaceXAI Collection ]`，
-- 而 /collections 的陈列顺序是 `Mens · SpaceXAI Collection · Womens · X Collection`
-- —— 两者顺序不同，单一 sortOrder 无法同时表达，故新增本列。
-- 非空 = 出现在首页横幅，值即左右次序（1=左，2=右）。

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "homeSortOrder" INTEGER;

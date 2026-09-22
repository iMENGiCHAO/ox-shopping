-- COD（货到付款）到付费落库：`Order.codFee DECIMAL(10,2) NULL`。
--
-- 背景（商业交付缺陷报告 A2 项）：此前到付费（承运商现金代收服务费）只在结账页
-- 由前端临时计算展示，订单行从不记录。后果：
--   1. 顾客下单后任何页面（订单详情 / 管理端 / 邮件 / 对账）都查不到「送达时到底应收多少现金」，
--      现场收派对不上金额只能靠顾客口述 —— 现金交易不可接受；
--   2. 财务对账缺少 COD 现金应收科目的数据来源。
-- 现在 createOrder 落库 codFee（快照），全链路展示/对账统一以它为准。
--
-- 注：本迁移为手工编写（开发库存在 db push 建的分销表 drift，`migrate dev` 会要求
-- reset，故用 `migrate deploy` 应用；生产从零建库按顺序执行全部迁移，本表为增量列，安全）。

ALTER TABLE "orders" ADD COLUMN "codFee" DECIMAL(10,2) NULL;

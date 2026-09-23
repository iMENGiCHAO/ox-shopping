-- 客服留言（ContactMessage）功能整体下线。
--
-- 决策依据（大爷 2026-09-22）：公开留言表单无商业价值（前台顾客实际走
-- 「客服邮箱」与 FAQ），且是灌水/垃圾信息攻击面 —— 匿名表单即公开写库入口。
-- 前台 /pages/contact、后台「客服留言」管理页、API（/api/contact、
-- /api/admin/contact-messages）、通知邮件模板与限流策略已一并移除；
-- 联系渠道收敛为：FAQ 页客服邮箱（supportEmail）+ 后台可配置的联系板块。
DROP TABLE "contact_messages";

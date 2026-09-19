-- 清理已移除功能「全站公告」的遗留数据。
-- 前台公告栏与后台公告设置均已下线，代码不再读取这两项，删除避免孤儿数据。
DELETE FROM "site_settings" WHERE "key" IN ('announcement', 'announcementEnabled');

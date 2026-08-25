#!/usr/bin/env node
/* eslint-disable no-console */
// 一次性补齐 i18n 缺失键（shop/admin 各归其位），幂等可重复执行。
import { readFileSync, writeFileSync } from "node:fs";

const SHOP = [
  ["Your deletion request has been received; we will process it after verification", "注销申请已收到，核实后我们将处理您的请求"],
  ["Create your SpaceXAI Shop account and start shopping.", "创建 SpaceXAI 商城账户，即刻开启购物。"],
  ["items", "件商品"],
  ["No matching orders", "没有匹配的订单"],
  ["Availability", "库存状态"],
  ["Price", "价格"],
  ["to", "至"],
  ["Shopping bag", "购物袋"],
  ["Close bag", "关闭购物袋"],
  ["Added to bag", "已加入购物袋"],
  ['We use cookies to improve your browsing experience and analyze traffic. Clicking "Accept all" means you agree to our use of', "我们使用 Cookie 改进浏览体验并分析流量。点击「全部接受」即表示您同意我们的"],
  ["Previous", "上一页"],
  ["Next", "下一页"],
  ["__lang__", "__lang__"],
  ["Decrease quantity", "减少数量"],
  ["Increase quantity", "增加数量"],
  ["Refund request submitted; we will review it as soon as possible", "退款申请已提交，我们会尽快审核"],
  ["Hi {name}", "您好，{name}"],
];

const ADMIN = [
  ["No log entries", "暂无日志"],
  ["Already at the boundary", "已在边界"],
  ["Sort order updated", "排序已更新"],
  ["Category updated", "分类已更新"],
  ["Category created", "分类已创建"],
  ["Category deleted", "分类已删除"],
  ["Move up", "上移"],
  ["Move down", "下移"],
  ["Delete", "删除"],
  ["Categories", "分类"],
  ["Sort", "排序"],
  ["Actions", "操作"],
  ["No categories yet", "暂无分类"],
  ["Category description", "分类描述"],
  ["Delete category", "删除分类"],
  ["Coupon updated", "优惠券已更新"],
  ["Coupon created", "优惠券已创建"],
  ["Coupon deleted", "优惠券已删除"],
  ["Coupons", "优惠券"],
  ["Status", "状态"],
  ["No coupons yet", "暂无优惠券"],
  ["Delete coupon", "删除优惠券"],
  ["Question", "问题"],
  ["Answer", "回答"],
  ["Admin", "管理员"],
  ["Orders", "订单"],
  ["Search order # / recipient / email", "搜索订单号 / 收件人 / 邮箱"],
  ["All statuses", "全部状态"],
  ["No orders yet", "暂无订单"],
  ["Dashboard", "仪表盘"],
  ["Refunds", "退款"],
  ["Stock", "库存"],
  ["Customer", "客户"],
  ["Date", "日期"],
  ["Please select products first", "请先选择商品"],
  ["Stock must be a non-negative integer", "库存必须为非负整数"],
  ["All categories", "全部分类"],
  ["Select all", "全选"],
  ["Image", "图片"],
  ["SKU", "SKU"],
  ["Sold", "已售"],
  ["No products yet", "暂无商品"],
  ["Edit stock", "编辑库存"],
  ["Change status", "变更状态"],
  ["Archived", "已下架"],
  ["Editing", "编辑中"],
  ["No refund requests", "暂无退款申请"],
  ["System Settings", "系统设置"],
  ["MENG Shop", "MENG 商城"],
  ["Describe your store in one line", "一句话描述你的店铺"],
  ["Users", "用户"],
  ["Search email / name", "搜索邮箱 / 姓名"],
  ["No users yet", "暂无用户"],
  ["Display name updated", "显示名已更新"],
  ["Password changed", "密码已修改"],
  ["Enter a display name", "请输入显示名"],
  ["Role", "角色"],
  ["Delete image", "删除图片"],
  ["ProductName", "商品名称"],
  ["Enter a product name", "请输入商品名称"],
  ["Please select a category", "请选择分类"],
  ["Detailed product description", "商品详细描述"],
  ["Attribute name, e.g. Color / Material / Size", "属性名，如 颜色 / 材质 / 尺码"],
  ["Values, comma-separated, e.g. Black, White", "属性值，逗号分隔，如 黑色, 白色"],
  ["Delete this attribute", "删除该属性"],
  ["Shipping info saved", "物流信息已保存"],
  ["Shipped successfully", "发货成功"],
  ["Enter the tracking number", "请输入运单号"],
  ["User info updated", "用户信息已更新"],
  ["Password reset — this user must sign in again", "密码已重置——该用户需重新登录"],
];

function inject(file, entries) {
  let src = readFileSync(file, "utf8");
  const start = src.indexOf("const DICT");
  if (start < 0) throw new Error(`DICT not found in ${file}`);
  const close = src.indexOf("\n};", start);
  if (close < 0) throw new Error(`DICT close not found in ${file}`);
  const existing = src.slice(start, close);
  const block = entries
    .filter(([k]) => !existing.includes(JSON.stringify(k)))
    .map(
      ([k, zh]) =>
        `  ${JSON.stringify(k)}: { en: ${JSON.stringify(k)}, zh: ${JSON.stringify(zh)} },`,
    )
    .join("\n");
  if (!block) {
    console.log(`${file}: 无需补充`);
    return;
  }
  src = src.slice(0, close) + "\n" + block + src.slice(close);
  writeFileSync(file, src);
  console.log(`${file}: +${block.split("\n").length} 条`);
}

inject("src/lib/shop-i18n.ts", SHOP);
inject("src/lib/admin-i18n.ts", ADMIN);

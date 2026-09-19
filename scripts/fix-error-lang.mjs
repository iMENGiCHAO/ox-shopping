/**
 * 一次性修复：把**顾客可见**的 API 错误文案从中文源串改为英文源串。
 *
 * 背景：`apiHandler` 只做「英→中」本地化（ERROR_ZH），所以代码里若直接写中文，
 * 英文站用户就会看到中文。本脚本把中文源串替换成英文源串，中文再由 ERROR_ZH 提供。
 *
 * 只替换**带引号的字面量**（`"..."` 与 `` `...` ``），不碰注释。
 * 每个映射都会报告命中次数，0 命中的会列出来以便人工复核。
 *
 * 用法：node scripts/fix-error-lang.mjs [--apply]
 *       不带 --apply 时只做 dry-run。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** [中文源串, 英文源串] —— 英文源串需同时在 src/lib/error-i18n.ts 的 ERROR_ZH 有对应中文 */
const MAP = [
  ["发送过于频繁，请稍后再试", "Too many requests, please try again later"],
  [
    "失败次数过多，账号已临时锁定，请 15 分钟后再试",
    "Too many failed attempts — this account is temporarily locked. Please try again in 15 minutes",
  ],
  ["注册信息无效，请刷新页面后重试", "Invalid registration details, please refresh the page and try again"],
  ["账号不存在", "Account not found"],
  ["邮箱已验证，无需重发", "This email is already verified"],
  ["登记太频繁，请稍后再试", "Too many requests, please try again later"],
  ["商品不存在或已下架", "Product not found or no longer available"],
  ["商品不存在", "Product not found"],
  [
    "所选规格当前有货，可直接购买，无需登记到货通知",
    "This variant is in stock — you can add it to your bag now",
  ],
  ["模拟支付未启用", "Mock payment is not enabled"],
  ["支付渠道不存在", "Payment channel not found"],
  ["支付渠道未启用", "This payment channel is not enabled"],
  ["地址不存在", "Address not found"],
  [
    "您已提交过注销申请，客服正在处理中；如需撤回请先取消当前申请",
    "You already have a pending account-deletion request. To withdraw it, cancel the current request first",
  ],
  ["当前没有在途的注销申请，无需撤回", "There is no pending account-deletion request to withdraw"],
  ["当前密码不正确", "Current password is incorrect"],
  ["新邮箱与当前邮箱相同", "The new email is the same as your current email"],
  ["该邮箱已被其他账号使用", "This email is already used by another account"],
  ["渠道 code 已存在", "A payment channel with this code already exists"],
  [
    "请先完成该渠道的参数配置，再启用（未配置的渠道无法收款）",
    "Configure this channel before enabling it — an unconfigured channel cannot accept payments",
  ],
  ["支付宝渠道尚未接入真实退款请求（开发阶段）。", "Alipay refunds are not connected to the live gateway yet."],
  [
    "银行卡渠道尚未接入真实退款请求（支付账户未接入）。",
    "Bank card refunds are not connected to the live gateway yet.",
  ],
  [
    "PayPal 渠道尚未接入真实退款请求（支付账户未接入）。",
    "PayPal refunds are not connected to the live gateway yet.",
  ],
  [
    "缺少 Stripe Payment Intent ID，无法发起网关退款",
    "Missing Stripe Payment Intent ID — cannot issue a gateway refund",
  ],
  [
    "微信支付渠道尚未接入真实退款请求（开发阶段）。",
    "WeChat Pay refunds are not connected to the live gateway yet.",
  ],
  ["规格「${s.name}」不是该商品的可选规格", 'Option "${s.name}" is not available for this product'],
  ["规格「${s.name}」的值「${s.value}」无效", 'Option "${s.name}" value "${s.value}" is invalid'],
  ["库存不足，当前仅剩 ${product.stock} 件", "Not enough stock — only ${product.stock} left"],
  ["库存不足，当前仅剩 ${product?.stock ?? 0} 件", "Not enough stock — only ${product?.stock ?? 0} left"],
  [
    "Shopping Bag最多 ${MAX_CART_ITEMS} 种商品",
    "Your Shopping Bag can hold at most ${MAX_CART_ITEMS} different items",
  ],
  ["该支付渠道暂未开通，请选择其他支付方式", "This payment method is not available yet, please choose another one"],
  ["该支付渠道尚未配置，请选择其他支付方式", "This payment method is not configured, please choose another one"],
  [
    "该支付渠道不支持当前结算币种，请切换币种或选择其他支付方式",
    "This payment method does not support your checkout currency — switch currency or choose another one",
  ],
  ["分类不存在", "Category not found"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const hits = new Map(MAP.map(([zh]) => [zh, 0]));
let changedFiles = 0;

for (const file of walk(SRC)) {
  const original = readFileSync(file, "utf8");
  let next = original;
  for (const [zh, en] of MAP) {
    for (const q of ['"', "`"]) {
      const needle = `${q}${zh}${q}`;
      const replacement = `${q}${en}${q}`;
      const parts = next.split(needle);
      if (parts.length > 1) {
        hits.set(zh, hits.get(zh) + (parts.length - 1));
        next = parts.join(replacement);
      }
    }
  }
  if (next !== original) {
    changedFiles++;
    if (APPLY) writeFileSync(file, next, "utf8");
    console.log(`${APPLY ? "改写" : "将改写"} ${relative(ROOT, file)}`);
  }
}

console.log(`\n映射命中统计（共 ${MAP.length} 条）：`);
const missed = [];
for (const [zh, en] of MAP) {
  const n = hits.get(zh);
  if (n === 0) missed.push(zh);
  console.log(`  ${String(n).padStart(2)}×  ${zh.slice(0, 34)}${zh.length > 34 ? "…" : ""}  →  ${en.slice(0, 44)}`);
}
if (missed.length) {
  console.log(`\n⚠️ 以下 ${missed.length} 条 0 命中，请人工确认（可能写法不同或已被替换）：`);
  missed.forEach((m) => console.log(`   ${m}`));
}
console.log(`\n${APPLY ? "已改写" : "预计改写"} ${changedFiles} 个文件。`);
if (!APPLY) console.log("（dry-run；加 --apply 才会真正写入）");

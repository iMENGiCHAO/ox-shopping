import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { formatMoney } from "@/lib/utils";
import { notifyAdmins } from "@/server/services/notification.service";

/**
 * 到货通知（Notify me）补货触发：
 * 库存/规格库存更新后调用 notifyRestock(productId)，
 * 对仍处于 draft 的登记逐条做「变体级匹配」后发提醒邮件并置为 notified。
 *
 * 匹配规则（与官方一致：客户选了什么规格就按什么规格提醒）：
 * - 客户未选规格 → 商品总库存 > 0 即通知
 * - 客户选了规格（如 {"Color":"Black","Size":"M"}）→ 所选的每个规格组
 *   在 specStock 中有数据时要求对应值 > 0；specStock 未覆盖的组视为可用
 * - 商品下架 / 总库存为 0 → 任何人不通知
 */

type JsonRecord = Record<string, unknown>;

/** 查询某规格值当前是否有货；specStock 无该组数据时返回 null（视为可用） */
function specValueAvailable(specStock: unknown, group: string, value: string): boolean | null {
  if (!specStock || typeof specStock !== "object") return null;
  const g = (specStock as JsonRecord)[group];
  if (!g || typeof g !== "object") return null;
  const count = (g as JsonRecord)[value];
  return typeof count === "number" ? count > 0 : null;
}

/** 补货触发入口：返回本次成功发出的提醒数 */
export async function notifyRestock(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  // 下架或无库存：不通知任何人
  if (!product || product.status !== "ACTIVE" || product.stock <= 0) return 0;

  const subs = await prisma.notifyMe.findMany({
    where: { productId, status: "draft" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 200,
  });
  if (subs.length === 0) return 0;

  let sent = 0;
  for (const sub of subs) {
    // 变体级匹配
    const attrs = sub.attributes;
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      const entries = Object.entries(attrs as JsonRecord).filter(
        ([, v]) => typeof v === "string" && v.length > 0,
      ) as [string, string][];
      const allAvailable = entries.every(([group, value]) => {
        return specValueAvailable(product.specStock, group, value) !== false;
      });
      // 客户关注的那个规格仍未补上 → 继续等
      if (!allAvailable) continue;
    }

    const variantText =
      attrs && typeof attrs === "object" && !Array.isArray(attrs)
        ? (Object.entries(attrs as JsonRecord) as [string, string][])
            .filter(([, v]) => typeof v === "string" && v.length > 0)
            .map(([g, v]) => `${g}: ${v}`)
            .join(" / ")
        : undefined;

    // 商品卡数据：图 + 名 + 卖点节选 + 价格（提醒邮件即广告）
    const images = Array.isArray(product.images) ? (product.images as unknown[]) : [];
    const firstImage = typeof images[0] === "string" ? images[0] : undefined;
    const imageUrl = firstImage
      ? /^https?:\/\//.test(firstImage)
        ? firstImage
        : `${env.SITE_URL}${firstImage}`
      : undefined;
    const excerpt =
      typeof product.description === "string"
        ? product.description.replace(/\s+/g, " ").trim().slice(0, 140)
        : undefined;
    const priceNum = Number(product.price);
    const compareNum = product.compareAtPrice ? Number(product.compareAtPrice) : null;

    void sendMail({
      to: sub.email,
      template: "restock",
      data: {
        name: sub.email.split("@")[0] ?? sub.email,
        productName: product.nameEn ?? product.name,
        ...(variantText ? { variantText } : {}),
        ...(imageUrl ? { image: imageUrl } : {}),
        ...(excerpt ? { excerpt } : {}),
        priceText: formatMoney(priceNum, env.CURRENCY),
        ...(compareNum && compareNum > priceNum
          ? { compareAtText: formatMoney(compareNum, env.CURRENCY) }
          : {}),
        productUrl: `${env.SITE_URL}/products/${product.slug}`,
        // 预售商品上库存 → 邮件切换「预购开售」口径（商品配置了预售提示文案即视为预售）
        isPresale: !!(product.presaleNoteZh || product.presaleNoteEn),
        // 按订阅时记录的用户语种发邮件（null/未记录 → 默认 en）
        lang: sub.lang === "zh" ? "zh" : "en",
      },
    });

    await prisma.notifyMe.update({
      where: { id: sub.id },
      data: { status: "notified", notifiedAt: new Date() },
    });
    sent++;
  }

  // 站内消息：通知管理员「补货已自动提醒 N 位客户」（不静默）
  if (sent > 0) {
    const name = product.nameEn ?? product.name;
    void notifyAdmins({
      type: "system",
      title: "到货提醒已发送",
      titleEn: "Restock alerts sent",
      body: `「${name}」补货成功，已自动向 ${sent} 位登记的客户发送到货提醒邮件（含商品卡）。`,
      bodyEn: `"${name}" is back in stock. Restock emails with product cards were sent to ${sent} subscribers.`,
      link: "/admin/notify-me",
      meta: { productId, productName: name, sent },
    });
  }
  return sent;
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import { formatMoney } from "@/lib/utils";
import { notifyAdmins } from "@/server/services/notification.service";
import { logger } from "@/lib/logger";
import {
  findVariant,
  normalizeSelection,
  parseVariantAttributes,
  type VariantLike,
} from "@/server/services/variant-stock";

/**
 * 到货通知（Notify me）补货触发：
 * 库存/规格库存/组合库存更新后调用 notifyRestock(productId)，
 * 对仍处于 draft 的登记逐条做「变体级匹配」后发提醒邮件并置为 notified。
 *
 * 匹配规则（与官方一致：客户选了什么规格就按什么规格提醒）：
 * - 客户未选规格 → 商品总库存 > 0 即通知
 * - 变体模式（商品有组合，父组×子组组合粒度）→ 按登记的组合定位变体：
 *   组合存在且库存 > 0 才通知 —— 某个「颜色×尺码」单独回货只提醒登记了
 *   该组合的客户；组合不存在/仍售罄 → 继续等（此前只看 specStock，
 *   变体商品 specStock 为空时任意补货会把「从未售罄」的组合也通知出去）
 * - 存量维度池（specStock）→ 所选的每个规格组在 specStock 中有数据时
 *   要求对应值 > 0；specStock 未覆盖的组视为可用
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

/** 单批读取上限；用稳定 (createdAt,id) 键集继续翻页，避免 200 条之后永远留在 draft。 */
const RESTOCK_BATCH_SIZE = 200;

/** 补货触发入口：返回本次**真实投递成功**的提醒数 */
export async function notifyRestock(productId: string): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  // 下架或无库存：不通知任何人
  if (!product || product.status !== "ACTIVE" || product.stock <= 0) return 0;

  // 变体模式（组合粒度）：一次性取 active 组合，逐条登记按组合匹配
  const variantRows = await prisma.productVariant.findMany({
    where: { productId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const variants: VariantLike[] = variantRows.map((v) => ({
    id: v.id,
    attributes: parseVariantAttributes(v.attributes),
    stock: v.stock,
    isActive: v.isActive,
  }));

  let sent = 0;
  let failed = 0;
  let cursor: { createdAt: Date; id: string } | undefined;

  // 逐批扫完所有 draft，而不是把 take:200 当成全量。使用 (createdAt,id) keyset，
  // 不依赖 cursor 行仍在 where 中：首批成功后会立刻变成 notified，普通 Prisma cursor
  // 在这种「边读边改状态」场景下可能把第二批截断。失败行保持 draft，下次触发仍会重试。
  while (true) {
    const subs = await prisma.notifyMe.findMany({
      where: {
        productId,
        status: "draft",
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: RESTOCK_BATCH_SIZE,
    });
    if (subs.length === 0) break;
    const last = subs[subs.length - 1]!;
    cursor = { createdAt: last.createdAt, id: last.id };

    for (const sub of subs) {
      // 变体级匹配
      const attrs = sub.attributes;
      if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
        if (variants.length > 0) {
          // 变体模式（组合粒度）：按登记的组合定位变体 —— 组合不存在或
          // 库存仍为 0 → 继续等；组合回货（stock > 0）→ 通知该客户。
          // 与购物车/下单用同一套 findVariant 签名定位（前后端数据打通）。
          const variant = findVariant(
            variants,
            normalizeSelection(attrs as Record<string, string>),
          );
          if (!variant || variant.stock <= 0) continue;
        } else {
          // 存量维度池：所选每个规格值在 specStock 中有数据时要求 > 0
          const entries = Object.entries(attrs as JsonRecord).filter(
            ([, v]) => typeof v === "string" && v.length > 0,
          ) as [string, string][];
          const allAvailable = entries.every(([group, value]) => {
            return specValueAvailable(product.specStock, group, value) !== false;
          });
          // 客户关注的那个规格仍未补上 → 继续等
          if (!allAvailable) continue;
        }
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

      let delivered = false;
      try {
        const result = await sendMail({
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
        delivered = result.delivered;
      } catch {
        // sendMail 已承诺不抛；这里保留防御，第三方实现变化时也不误标 notified。
        delivered = false;
      }

      if (!delivered) {
        failed++;
        continue;
      }
      await prisma.notifyMe.update({
        where: { id: sub.id },
        data: { status: "notified", notifiedAt: new Date() },
      });
      sent++;
    }
  }

  // 站内消息：成功与失败都显式汇报，避免 console/网关异常让运营误以为全部送达。
  if (sent > 0 || failed > 0) {
    const name = product.nameEn ?? product.name;
    const partial = failed > 0;
    void notifyAdmins({
      type: "system",
      title: partial ? "到货提醒部分失败" : "到货提醒已发送",
      titleEn: partial ? "Some restock alerts failed" : "Restock alerts sent",
      body: `「${name}」补货处理完成：成功 ${sent} 条，失败待重试 ${failed} 条。`,
      bodyEn: `"${name}" restock processing finished: ${sent} delivered, ${failed} failed and remain queued for retry.`,
      link: "/admin/notify-me",
      meta: { productId, productName: name, sent, failed },
    });
  }
  return sent;
}

/**
 * 失败到货提醒重扫（业务闭环审计建议#4）：发送失败的登记保持 draft，此前
 * 只能等「下一次库存事件」触发重试 —— 若商品再无库存变动（补货季一次售
 * 完），失败行永远悬挂。这里由调度器周期性兜底：找仍有 draft 的商品，
 * 复用 notifyRestock 全语义（在售/库存/变体匹配守卫 + 批量 keyset + 成败
 * 汇报）。幂等：notified 行不再命中，稳态零成本。
 */
export async function retryFailedRestockAlerts(): Promise<number> {
  const groups = await prisma.notifyMe.groupBy({
    by: ["productId"],
    where: { status: "draft" },
    _count: { _all: true },
    orderBy: { productId: "asc" },
    take: 20,
  });
  let total = 0;
  for (const g of groups) {
    if (!g.productId) continue; // 商品已删（productId SetNull）：无从通知
    try {
      total += await notifyRestock(g.productId);
    } catch (err) {
      // 单商品失败不中断整批
      logger.warn({ err, productId: g.productId }, "[restock-retry] 到货提醒重扫单商品失败");
    }
  }
  return total;
}

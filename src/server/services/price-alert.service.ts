import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { createNotification, notifyAdmins } from "@/server/services/notification.service";

/**
 * 降价通知服务（与 Favorite 1:1）：
 *  - onFavoriteCreated: 收藏某商品时，自动创建对应的 price_alert
 *  - onFavoriteRemoved: 取消收藏时，cascade 删除 price_alert
 *  - onProductPriceDropped: 商品价格下降时，通知所有"已收藏 + 未取消订阅"的用户
 *  - listForUser: 列出当前用户已订阅的降价通知
 *  - unsubscribe / resubscribe: 显式管理通知（不删收藏，只关闭通知）
 *
 * 设计：
 *  - 收件人 = User.email（已登录收藏），不再要求额外输入邮箱
 *  - lang 来自 Favorite.lang（收藏时的浏览器语种），用户手动改语种不影响已订阅
 *  - 同一价位不重复发：notifiedPrice === newPrice 时跳过
 */
export interface PriceAlertRecord {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  currentPrice: number;
  lang: string | null;
  notifiedAt: Date | null;
  notifiedPrice: number | null;
  unsubscribed: boolean;
  createdAt: Date;
}

/** 收藏时触发：自动创建 price_alert 订阅 */
export async function onFavoriteCreated(input: {
  favoriteId: string;
  userId: string;
  productId: string;
  lang?: string | null;
}): Promise<void> {
  // 幂等：避免重复建（已存在 favoriteId 唯一约束）
  const existing = await prisma.priceAlert.findUnique({
    where: { favoriteId: input.favoriteId },
  });
  if (existing) {
    // 已存在：恢复（如果之前 unsubscribe 了）
    if (existing.unsubscribed) {
      await prisma.priceAlert.update({
        where: { id: existing.id },
        data: { unsubscribed: false, notifiedAt: null, notifiedPrice: null },
      });
    }
    return;
  }
  await prisma.priceAlert.create({
    data: {
      favoriteId: input.favoriteId,
      productId: input.productId,
      userId: input.userId,
      lang: input.lang ?? null,
    },
  });
}

/** 显式取消通知（不删收藏，UI 可重新订阅） */
export async function unsubscribe(id: string, userId: string): Promise<boolean> {
  const res = await prisma.priceAlert.updateMany({
    where: { id, userId, unsubscribed: false },
    data: { unsubscribed: true },
  });
  return res.count > 0;
}

/** 重新订阅（无需重新收藏） */
export async function resubscribe(id: string, userId: string): Promise<boolean> {
  const res = await prisma.priceAlert.updateMany({
    where: { id, userId, unsubscribed: true },
    data: { unsubscribed: false },
  });
  return res.count > 0;
}

/** 列出当前用户的降价通知（含商品信息） */
export async function listForUser(userId: string): Promise<PriceAlertRecord[]> {
  const rows = await prisma.priceAlert.findMany({
    where: { userId },
    include: { product: { select: { name: true, slug: true, price: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.product?.name ?? "(已下架)",
    productSlug: r.product?.slug ?? "",
    currentPrice: r.product ? Number(r.product.price) : 0,
    lang: r.lang,
    notifiedAt: r.notifiedAt,
    notifiedPrice: r.notifiedPrice ? Number(r.notifiedPrice) : null,
    unsubscribed: r.unsubscribed,
    createdAt: r.createdAt,
  }));
}

/** 商品价格下降 → 通知所有已收藏 + 未取消订阅的用户 */
export async function onProductPriceDropped(input: {
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
  oldPrice: number;
  newPrice: number;
  currency: string;
}): Promise<{ notified: number }> {
  if (input.newPrice >= input.oldPrice) return { notified: 0 };

  const subs = await prisma.priceAlert.findMany({
    where: { productId: input.productId, unsubscribed: false },
    include: { user: { select: { email: true, name: true } } },
  });
  if (subs.length === 0) return { notified: 0 };

  const productUrl = `${env.SITE_URL}/products/${input.productSlug}`;
  const diff = input.oldPrice - input.newPrice;
  const percent = Math.round((diff / input.oldPrice) * 100);

  let notifiedCount = 0;
  for (const s of subs) {
    // 同价位已通知过 → 跳过（避免反复发同一价位）
    if (s.notifiedPrice !== null && Number(s.notifiedPrice) === input.newPrice) {
      continue;
    }
    const isZh = s.lang === "zh";
    const email = s.user?.email;
    if (!email) continue; // 用户 email 不存在就跳过（理论上不会）

    void sendMail({
      to: email,
      template: "price-drop",
      data: {
        productName: input.productName,
        image: input.productImage ?? undefined,
        oldPrice: input.oldPrice.toFixed(2),
        newPrice: input.newPrice.toFixed(2),
        currency: input.currency,
        percent,
        productUrl,
        unsubscribeUrl: `${env.SITE_URL}/account/favorites?unsubscribe=${s.id}`,
        lang: isZh ? "zh" : "en",
      },
    }).catch(() => undefined);

    // 站内消息
    void createNotification({
      userId: s.userId,
      type: "price_alert",
      title: isZh ? "收藏商品降价了" : "Price drop on saved item",
      titleEn: "Price drop on saved item",
      body: isZh
        ? `您收藏的「${input.productName}」已从 ${input.currency} ${input.oldPrice.toFixed(
            2,
          )} 降到 ${input.currency} ${input.newPrice.toFixed(2)}（降 ${percent}%）`
        : `"${input.productName}" dropped from ${input.currency} ${input.oldPrice.toFixed(
            2,
          )} to ${input.currency} ${input.newPrice.toFixed(2)} (-${percent}%)`,
      link: `/products/${input.productSlug}`,
      meta: {
        productId: input.productId,
        oldPrice: input.oldPrice,
        newPrice: input.newPrice,
      },
    });

    await prisma.priceAlert.update({
      where: { id: s.id },
      data: {
        notifiedAt: new Date(),
        notifiedPrice: input.newPrice,
      },
    });
    notifiedCount += 1;
  }

  // 站内消息：通知管理员「降价提醒已发送」（运营知晓，不静默）
  if (notifiedCount > 0) {
    void notifyAdmins({
      type: "system",
      title: "降价提醒已发送",
      titleEn: "Price-drop alerts sent",
      body: `「${input.productName}」降价至 ${input.currency} ${input.newPrice.toFixed(
        2,
      )}，已自动提醒 ${notifiedCount} 位收藏客户（含邮件+站内信）。`,
      bodyEn: `"${input.productName}" dropped to ${input.currency} ${input.newPrice.toFixed(
        2,
      )}. Price-drop alerts were sent to ${notifiedCount} customers.`,
      link: `/admin/products`,
      meta: { productId: input.productId, newPrice: input.newPrice, notified: notifiedCount },
    });
  }
  return { notified: notifiedCount };
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import {
  createNotification,
  type NotificationType,
} from "@/server/services/notification.service";
import { cnyText } from "./format-server";

/**
 * 分销通知（P1-7）：站内信 + 邮件双通道。
 *
 * 大爷的要求是「商业交付级别」——而分销商此前的处境是：佣金什么时候结算、提现审批
 * 通过没有，全靠自己反复刷页面。真实的产品里，这类**钱的状态变化必须主动送达**。
 *
 * 工程约定：
 *   1. 通知是**旁路**：任何一步失败只记日志，绝不回滚主流程（钱的操作已经落库）；
 *   2. 站内信写 zh + en 两份（消息中心按界面语言取），邮件按用户语言偏好渲染；
 *   3. 用户已注销（无 userId/email）时静默跳过 —— 没有收件人就没有通知。
 */

/**
 * 邮件语言：优先读 SiteSetting 的默认语言（后台可配），缺省 zh（项目主语言）。
 *
 * 说明：User 表没有语言偏好字段（商城语言是按请求/站点走的），因此这里不做
 * 「按用户语言发信」的假设 —— 与其猜，不如用站点默认语言，并在正文里同时给出
 * 站内信的中英双份（消息中心按界面语言取）。
 */
async function langOf(): Promise<"zh" | "en"> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: "defaultLang" } });
    const value = row?.value;
    if (typeof value === "string" && (value === "zh" || value === "en")) return value;
  } catch {
    /* 读设置失败不影响发信 */
  }
  return "zh";
}

interface BaseNotice {
  userId: string;
  /** 站内信跳转 */
  link?: string;
  /** 金额（CNY），用于文案 */
  amountCny?: number;
}

async function deliver(params: {
  userId: string;
  type: NotificationType;
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  link?: string;
  ctaZh?: string;
  ctaEn?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const { userId } = params;
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { email: true, name: true, status: true } })
    .catch(() => null);
  if (!user) return; // 用户已删除：没有收件人

  // 1) 站内信（写失败不影响邮件）
  try {
    await createNotification({
      userId,
      type: params.type,
      title: params.titleZh,
      titleEn: params.titleEn,
      body: params.bodyZh,
      bodyEn: params.bodyEn,
      link: params.link ?? null,
      meta: params.meta ?? null,
    });
  } catch (err) {
    logger.error({ err, userId, type: params.type }, "分销通知：站内信写入失败（已忽略）");
  }

  // 2) 邮件（未配置邮件通道时 mail 服务自身会降级为控制台/文件输出）
  if (!user.email) return;
  try {
    const lang = await langOf();
    await sendMail({
      template: "distribution-notice",
      to: user.email,
      data: {
        name: user.name || (lang === "zh" ? "你好" : "there"),
        title: lang === "zh" ? params.titleZh : params.titleEn,
        body: lang === "zh" ? params.bodyZh : params.bodyEn,
        ctaText: lang === "zh" ? params.ctaZh : params.ctaEn,
        ctaUrl: params.link ? `${process.env.SITE_URL ?? ""}${params.link}` : undefined,
        lang,
      },
    });
  } catch (err) {
    logger.error({ err, userId, type: params.type }, "分销通知：邮件发送失败（已忽略）");
  }
}

/** 佣金已结算（可提现） */
export async function notifyCommissionSettled(input: BaseNotice & { orderNumber?: string }) {
  const amount = cnyText(input.amountCny ?? 0);
  await deliver({
    userId: input.userId,
    type: "distribution",
    titleZh: "佣金已结算",
    titleEn: "Commission settled",
    bodyZh: `你有 ${amount} 佣金已结算，现在可以提现。${input.orderNumber ? `（订单 ${input.orderNumber}）` : ""}`,
    bodyEn: `${amount} of commission has been settled and is now withdrawable.${input.orderNumber ? ` (Order ${input.orderNumber})` : ""}`,
    link: "/distribution/commissions",
    ctaZh: "查看佣金明细",
    ctaEn: "View commissions",
    meta: { event: "commission.settled", amountCny: input.amountCny },
  });
}

/** 佣金被冲正（退款/取消） */
export async function notifyCommissionReversed(
  input: BaseNotice & { orderNumber?: string; full?: boolean },
) {
  const amount = cnyText(input.amountCny ?? 0);
  await deliver({
    userId: input.userId,
    type: "distribution",
    titleZh: input.full ? "佣金已冲正" : "佣金部分冲正",
    titleEn: input.full ? "Commission reversed" : "Commission partially reversed",
    bodyZh: `${input.orderNumber ? `订单 ${input.orderNumber} ` : ""}发生退款，对应佣金 ${amount} 已${input.full ? "全额" : "按退款比例"}冲正。若该笔已入账，会从可提现余额中扣回。`,
    bodyEn: `A refund was issued${input.orderNumber ? ` on order ${input.orderNumber}` : ""}; ${amount} of commission has been ${input.full ? "fully" : "proportionally"} reversed. Any settled amount is deducted from your withdrawable balance.`,
    link: "/distribution/commissions",
    ctaZh: "查看佣金明细",
    ctaEn: "View commissions",
    meta: { event: "commission.reversed", amountCny: input.amountCny, full: !!input.full },
  });
}

/** 提现状态变化（申请已提交/通过/驳回/已打款） */
export async function notifyWithdrawStatus(input: {
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID";
  amountCny: number;
  note?: string | null;
}) {
  const amount = cnyText(input.amountCny);
  const zh: Record<typeof input.status, { t: string; b: string }> = {
    PENDING: { t: "提现申请已提交", b: `你的 ${amount} 提现申请已提交，等待平台审核。` },
    APPROVED: { t: "提现审核已通过", b: `你的 ${amount} 提现已通过审核，平台将安排打款。` },
    REJECTED: {
      t: "提现申请未通过",
      b: `你的 ${amount} 提现申请未通过${input.note ? `：${input.note}` : ""}，金额已退回可提现余额。`,
    },
    PAID: { t: "提现已打款", b: `你的 ${amount} 提现已打款完成，请留意收款账户。` },
  };
  const en: Record<typeof input.status, { t: string; b: string }> = {
    PENDING: {
      t: "Withdrawal submitted",
      b: `Your withdrawal request of ${amount} has been submitted and is awaiting review.`,
    },
    APPROVED: {
      t: "Withdrawal approved",
      b: `Your withdrawal of ${amount} has been approved; the payout will be arranged shortly.`,
    },
    REJECTED: {
      t: "Withdrawal declined",
      b: `Your withdrawal request of ${amount} was declined${input.note ? `: ${input.note}` : ""}. The amount has been returned to your withdrawable balance.`,
    },
    PAID: {
      t: "Withdrawal paid",
      b: `Your withdrawal of ${amount} has been paid. Please check your receiving account.`,
    },
  };
  await deliver({
    userId: input.userId,
    type: "distribution",
    titleZh: zh[input.status].t,
    titleEn: en[input.status].t,
    bodyZh: zh[input.status].b,
    bodyEn: en[input.status].b,
    link: "/distribution/withdrawals",
    ctaZh: "查看提现记录",
    ctaEn: "View withdrawals",
    meta: { event: `withdraw.${input.status.toLowerCase()}`, amountCny: input.amountCny },
  });
}

/** 成为分销商（首次成功推广） */
export async function notifyPromoted(input: { userId: string }) {
  await deliver({
    userId: input.userId,
    type: "distribution",
    titleZh: "你已成为分销商",
    titleEn: "You are now a distributor",
    bodyZh:
      "有人通过你的链接注册或下单，你已成为分销商。分享你的专属链接，后续的每一笔真实订单都会为你产生佣金。",
    bodyEn:
      "Someone signed up or ordered through your link, so you are now a distributor. Keep sharing your link — every real order it brings earns you commission.",
    link: "/distribution",
    ctaZh: "进入分销中心",
    ctaEn: "Open distribution center",
    meta: { event: "distributor.promoted" },
  });
}

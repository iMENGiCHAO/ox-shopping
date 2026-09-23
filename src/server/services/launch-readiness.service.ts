import "server-only";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getMailStatus } from "@/lib/mail";
import { listAdminChannels } from "@/lib/payment/channel.service";

/**
 * 上线自检（Launch Readiness）。
 *
 * 为什么需要：商业交付的阻塞项大多**不会在开发环境暴露** —— 没有可用收款渠道、
 * 邮件静默降级为写日志、站点地址还是 localhost、种子管理员没改默认密码……
 * 这些在功能测试里全是绿的，上线当天才炸。本模块把「能否开门做生意」的关键条件
 * 集中成一张**可核对**的清单。
 *
 * 设计原则（避免伪功能）：
 *   · 每一项都来自**真实检测**（渠道就绪状态、邮件通道状态、env 实际值、DB 查询），
 *     不写死、不猜；
 *   · 无法从应用侧检测的（DNS SPF/DKIM、备份策略、证书）**不列**，宁缺勿滥。
 */

export type ReadinessStatus = "ready" | "warn" | "blocked";

export interface ReadinessItem {
  key: string;
  label: string;
  status: ReadinessStatus;
  /** 现状：给出真实值，而不是「未配置」四个字 */
  detail: string;
  /** 该做什么（非 ready 时必填） */
  action?: string;
  /** 后台跳转 */
  href?: string;
}

export interface LaunchReadiness {
  items: ReadinessItem[];
  counts: { ready: number; warn: number; blocked: number };
  /** 无阻塞项即可上线（警告项按业务判断） */
  readyToLaunch: boolean;
}

/** 种子默认管理员：默认密码是公开信息，上线前必须改 */
const SEED_ADMIN_EMAILS = ["admin@example.com"];

/** Redis 连接串脱敏（可能含密码） */
function redactRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "已配置";
  }
}

export async function getLaunchReadiness(): Promise<LaunchReadiness> {
  const [channels, seedAdmins] = await Promise.all([
    listAdminChannels().catch(() => []),
    prisma.user
      .findMany({
        where: { email: { in: SEED_ADMIN_EMAILS }, passwordChangedAt: null },
        select: { email: true },
      })
      .catch(() => []),
  ]);
  const mail = await getMailStatus();

  const items: ReadinessItem[] = [];

  /* ① 收款能力（阻塞级）：没有「已启用 + 已配置 + 网关就绪」的渠道 = 顾客付不了款。
     预留级渠道 configured 为真但 ready 恒为 false（网关未接入），文案要区分这两种情况，
     否则运营会以为「填了密钥就能收钱」。
     **mock 不算真实收款**：「模拟支付」本地演示可用，但它不产生任何真实资金流，
     把它算成就绪会造成伪绿（生产环境下 mock 会被守卫挡住）。 */
  const payable = channels.filter((c) => c.enabled && c.ready && c.code !== "mock");
  const mockOnly =
    payable.length === 0 && channels.some((c) => c.enabled && c.ready && c.code === "mock");
  if (payable.length > 0) {
    items.push({
      key: "payment",
      label: "收款通道",
      status: "ready",
      detail: `${payable.length} 个渠道可真实收款：${payable.map((c) => c.name).join("、")}`,
      href: "/admin/payment-channels",
    });
  } else {
    const configuredButNotReady = channels.filter((c) => c.enabled && c.configured && !c.ready);
    items.push({
      key: "payment",
      label: "收款通道",
      status: "blocked",
      detail: mockOnly
        ? "当前只有「模拟支付」可用（不产生真实资金流）—— 本地演示无妨，上线必须接入真实渠道"
        : configuredButNotReady.length > 0
          ? `${configuredButNotReady.map((c) => c.name).join("、")} 已填配置但网关未就绪${configuredButNotReady.map((c) => (c.readyNote ? `（${c.readyNote}）` : "")).join("")}`
          : "没有任何可收款的支付渠道 —— 顾客在前台看不到可用付款方式，收到订单也收不到钱",
      action: "在「支付渠道」启用并填好密钥；预留渠道（支付宝/微信/银行卡/PayPal）需完成网关接入",
      href: "/admin/payment-channels",
    });
  }

  /* ② 邮件通道（阻塞级）：通道配置不全时 sendMail 静默降级为写日志 ——
     订单确认、发货通知、到货提醒、找回密码全部发不出去，而页面一切正常。 */
  items.push(
    mail.deliverable
      ? {
          key: "mail",
          label: "邮件通道",
          status: "ready",
          detail: `生效通道 ${mail.effective}，发件人 ${mail.from}`,
          href: "/admin/settings",
        }
      : {
          key: "mail",
          label: "邮件通道",
          status: "blocked",
          detail: mail.warning ?? "邮件通道未配置：所有邮件只会写入日志",
          action:
            "配置 MAIL_PROVIDER（resend/smtp）与密钥；域名需具备 SPF/DKIM，否则邮件会被收件方拒收。配置后用「设置 → 邮件服务」的连通性自检验证",
          href: "/admin/settings",
        },
  );

  /* ③ 站点地址（警告级）：影响邮件内链接、支付回调与 SEO */
  const placeholderUrl = /localhost|127\.0\.0\.1|example\.com/i.test(env.SITE_URL);
  items.push(
    placeholderUrl
      ? {
          key: "site-url",
          label: "站点地址",
          status: "warn",
          detail: `SITE_URL = ${env.SITE_URL}（本地/占位地址）`,
          action: "改为真实域名：邮件里的订单链接、支付回跳地址、sitemap 都依赖它",
        }
      : { key: "site-url", label: "站点地址", status: "ready", detail: env.SITE_URL },
  );

  /* ④ 强密钥守卫（警告级） */
  items.push(
    env.REQUIRE_STRONG_SECRETS
      ? {
          key: "secrets",
          label: "密钥守卫",
          status: "ready",
          detail: "REQUIRE_STRONG_SECRETS=true：弱 JWT 密钥、占位品牌名会直接拒绝启动",
        }
      : {
          key: "secrets",
          label: "密钥守卫",
          status: "warn",
          detail: "REQUIRE_STRONG_SECRETS=false：弱密钥与占位配置不会被拦下",
          action: "生产环境置为 true（与 mock 支付守卫同一开关）",
        },
  );

  /* ⑤ 上传存储（警告级） */
  items.push(
    env.STORAGE_DRIVER === "s3"
      ? {
          key: "storage",
          label: "文件存储",
          status: "ready",
          detail: `对象存储（bucket: ${env.S3_BUCKET}）`,
        }
      : {
          key: "storage",
          label: "文件存储",
          status: "warn",
          detail: "本地磁盘存储（STORAGE_DRIVER=local）",
          action: "容器重建或多实例部署会丢上传文件，生产建议切 S3",
        },
  );

  /* ⑥ 限流与缓存后端（警告级） */
  items.push(
    env.REDIS_ENABLED
      ? {
          key: "redis",
          label: "限流与缓存",
          status: "ready",
          detail: `Redis 已启用（${redactRedisUrl(env.REDIS_URL)}）`,
        }
      : {
          key: "redis",
          label: "限流与缓存",
          status: "warn",
          detail: "REDIS_ENABLED=false：限流与缓存降级为单进程内存",
          action: "多实例部署时各实例独立计数，防刷效果打折；单实例可接受",
        },
  );

  /* ⑦ 种子管理员改密（阻塞级：安全）—— 默认密码是公开信息 */
  items.push(
    seedAdmins.length === 0
      ? {
          key: "admin-password",
          label: "管理员密码",
          status: "ready",
          detail: "默认种子管理员已改密或已移除",
        }
      : {
          key: "admin-password",
          label: "管理员密码",
          status: "blocked",
          detail: `种子管理员 ${seedAdmins.map((a) => a.email).join("、")} 从未修改过密码`,
          action: "立即登录后台修改密码（默认密码写在文档与仓库里，等于没有防护）",
          href: "/admin/users",
        },
  );

  const counts = { ready: 0, warn: 0, blocked: 0 };
  for (const item of items) counts[item.status] += 1;

  return { items, counts, readyToLaunch: counts.blocked === 0 };
}

import { requireUser } from "@/lib/auth/session";
import { env, brandFallback } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getLang } from "@/lib/shop-i18n-server";
import { DISTRIBUTION_INVITE_PATH } from "@/lib/distribution/contract";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getIdentity } from "@/server/services/distribution";

export const runtime = "nodejs";

/** 海报文案（中英各一份；海报是图片，不能依赖前端 i18n 运行时） */
const COPY = {
  zh: {
    kicker: "分享有礼",
    title: "扫码或长按识别",
    subtitle: "好物分享给朋友，他下单你拿佣金",
    codeLabel: "我的推广码",
    linkLabel: "专属链接",
    note: "真实订单才产生佣金 · 复购同样计佣",
  },
  en: {
    kicker: "SHARE & EARN",
    title: "Scan to shop",
    subtitle: "Share with friends — you earn commission on their orders",
    codeLabel: "My code",
    linkLabel: "Invite link",
    note: "Real paid orders only · repeat purchases count",
  },
} as const;

/** XML 文本转义：品牌名/链接都可能含 & < > */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * GET /api/distribution/my/poster — 我的专属推广**海报**（SVG，P1-11）。
 *
 * 设计取舍：
 *   1. **服务端出 SVG**，不引入 sharp/canvas 等重依赖：SVG 是矢量、体积小、
 *      可直接下载/转发，手机端"长按保存"也能用；真要 PNG 时用任意工具转一次即可。
 *   2. 海报里嵌**真实的二维码**（`qrcode` 输出的 SVG 片段直接内联），
 *      扫码即带签名推广码，与 `/my/qrcode` 同源同码，不会出现"海报码和链接不一致"。
 *   3. 文案不走前端 i18n：海报是**脱离应用的图片**，必须由服务端按用户语言固化。
 *   4. 品牌名从站点设置读取（多语），缺失回退 env —— 商用部署换名不需要改代码。
 */
export async function GET(req: Request) {
  assertDistributionEnabled();
  const user = await requireUser();

  const lang = (await getLang()) === "zh" ? "zh" : "en";
  const c = COPY[lang];
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, lang).trim() || brandFallback;

  const identity = await getIdentity(user.id, env.SITE_URL);
  const base = env.SITE_URL.replace(/\/$/, "");
  const inviteUrl = `${base}${DISTRIBUTION_INVITE_PATH}?ref=${identity.referralCode}`;
  const displayUrl = inviteUrl.replace(/^https?:\/\//, "");

  /* 二维码内联：**不能只取 path 再自己 scale** —— qrcode 输出的路径坐标处在它自己的
     viewBox 坐标系里，外部再乘一个比例会算错（实测二维码被缩成一小块）。
     正确做法是嵌一个**嵌套 <svg>**，把 viewBox 原样带过来，由 SVG 自己缩放。 */
  let qrNested = "";
  try {
    const QRCode = (await import("qrcode")).default;
    const qrSvg = await QRCode.toString(inviteUrl, {
      type: "svg",
      margin: 0,
      width: 520,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    const viewBox = /viewBox="([^"]+)"/.exec(qrSvg)?.[1] ?? "0 0 520 520";
    const inner = qrSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    qrNested = `<svg x="200" y="580" width="680" height="680" viewBox="${viewBox}" shape-rendering="crispEdges">${inner}</svg>`;
  } catch (err) {
    logger.warn({ err }, "分销：海报二维码生成失败");
  }

  const W = 1080;
  const H = 1620;
  const poster = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(siteName)} ${esc(c.kicker)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f4f4f5"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="14" fill="#111111"/>

  <text x="80" y="150" font-family="-apple-system, 'PingFang SC', 'Helvetica Neue', Arial, sans-serif" font-size="40" font-weight="600" fill="#111111">${esc(siteName)}</text>
  <text x="80" y="215" font-family="-apple-system, 'PingFang SC', Arial, sans-serif" font-size="30" letter-spacing="6" fill="#71717a">${esc(c.kicker)}</text>

  <text x="80" y="330" font-family="-apple-system, 'PingFang SC', Arial, sans-serif" font-size="72" font-weight="700" fill="#111111">${esc(c.title)}</text>
  <text x="80" y="400" font-family="-apple-system, 'PingFang SC', Arial, sans-serif" font-size="34" fill="#52525b">${esc(c.subtitle)}</text>

  <rect x="80" y="470" width="920" height="920" rx="48" fill="#ffffff" stroke="#e4e4e7" stroke-width="2"/>
  ${qrNested}

  <rect x="80" y="1450" width="920" height="2" fill="#e4e4e7"/>
  <text x="80" y="1520" font-family="-apple-system, 'PingFang SC', Arial, sans-serif" font-size="28" fill="#71717a">${esc(c.codeLabel)}</text>
  <text x="80" y="1575" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="46" font-weight="600" letter-spacing="4" fill="#111111">${esc(identity.referralCode)}</text>
  <text x="1000" y="1520" text-anchor="end" font-family="-apple-system, 'PingFang SC', Arial, sans-serif" font-size="24" fill="#a1a1aa">${esc(c.linkLabel)}</text>
  <text x="1000" y="1560" text-anchor="end" font-family="ui-monospace, 'SF Mono', Menlo, monospace" font-size="22" fill="#71717a">${esc(displayUrl)}</text>
  <text x="1000" y="1596" text-anchor="end" font-family="-apple-system, 'PingFang SC', Arial, sans-serif" font-size="20" fill="#a1a1aa">${esc(c.note)}</text>
</svg>`;

  // 下载语义：?download=1 时带 Content-Disposition（前端"下载海报"按钮用）
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(poster, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=300",
      ...(download
        ? {
            "content-disposition": `attachment; filename="distribution-poster-${identity.referralCode}.svg"`,
          }
        : {}),
    },
  });
}

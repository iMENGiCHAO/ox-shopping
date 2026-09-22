import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DISTRIBUTION_INVITE_PATH } from "@/lib/distribution/contract";
import { assertDistributionEnabled } from "@/server/services/distribution/http";
import { getIdentity } from "@/server/services/distribution";

export const runtime = "nodejs";

/**
 * GET /api/distribution/my/qrcode — 我的专属推广二维码（SVG）。
 *
 * 为什么服务端生成而不是前端打包 QR 库：
 *   二维码是纯确定性渲染，服务端出 SVG 让客户端零依赖、零 JS 体积，
 *   且二维码内容（带签名推广码的链接）本来就只在服务端可信。
 */
export const GET = apiHandler(async () => {
  assertDistributionEnabled();
  const user = await requireUser();
  const identity = await getIdentity(user.id, env.SITE_URL);
  const target = `${env.SITE_URL.replace(/\/$/, "")}${DISTRIBUTION_INVITE_PATH}?ref=${identity.referralCode}`;

  try {
    const QRCode = (await import("qrcode")).default;
    const svg = await QRCode.toString(target, {
      type: "svg",
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    });
    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (err) {
    logger.warn({ err }, "分销：二维码生成失败");
    return new Response("", { status: 500 });
  }
});

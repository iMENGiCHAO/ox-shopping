import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/metrics — 轻量运行指标（Prometheus 文本格式）。
 *
 * 交付审计：项目此前**没有任何指标端点**，checklist 只写「必须告警」却没有可采集的源。
 * 这里提供最小可用的业务/进程指标，供 Prometheus 抓取与告警规则引用。
 *
 * 鉴权：`Authorization: Bearer <METRICS_TOKEN>`。**未配置 METRICS_TOKEN 时返回 404**
 * （默认不暴露；不设「无 token 即公开」的退化路径，避免误开内网指标）。
 */
export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return new Response("Not Found", { status: 404 });
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, orders, products, pendingOrders, orders24h] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.order.count({ where: { createdAt: { gte: since24h } } }),
  ]);

  const body = [
    "# HELP ecommerce_entities_total 业务实体计数",
    "# TYPE ecommerce_entities_total gauge",
    `ecommerce_entities_total{entity="users"} ${users}`,
    `ecommerce_entities_total{entity="orders"} ${orders}`,
    `ecommerce_entities_total{entity="products"} ${products}`,
    "# HELP ecommerce_orders_pending_payment 待支付订单（30 分钟未支付自动取消）",
    "# TYPE ecommerce_orders_pending_payment gauge",
    `ecommerce_orders_pending_payment ${pendingOrders}`,
    "# HELP ecommerce_orders_created_24h 近 24 小时新建订单（突增/骤降告警参考）",
    "# TYPE ecommerce_orders_created_24h gauge",
    `ecommerce_orders_created_24h ${orders24h}`,
    "# HELP process_uptime_seconds 进程运行时长（秒）",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${Math.round(process.uptime())}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}

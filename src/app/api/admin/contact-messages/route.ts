import { apiHandler, json, searchParam } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

export const runtime = "nodejs";

/** 与 ContactMessage.status 的取值域一致（见 schema.prisma 注释） */
export const CONTACT_MESSAGE_STATUSES = ["new", "read", "replied", "spam"] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

/** 分页上限：留言正文较长，一次最多 50 条，避免把后台页面拖成 MB 级响应 */
const MAX_PAGE_SIZE = 50;

/**
 * GET /api/admin/contact-messages?status=new&page=1&pageSize=20
 *
 * 客服留言收件箱（缺陷报告 P1-7）。
 *
 * 背景：`contact_messages` 表此前只写不读 —— 顾客通过「联系我们」提交的留言
 * 只触发一封内部通知邮件（MAIL_PROVIDER=console 时甚至只落日志），
 * 后台没有任何入口可以查看/跟进，顾客等不到回复也无人知晓。
 *
 * 返回：
 * - items：当前页留言（含 status/note/ip/source/lang，供客服判断语种与来源）
 * - counts：各状态计数（后台 Tab 角标用，不受当前筛选影响）
 */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const params = new URL(req.url).searchParams;

  const statusRaw = searchParam(params, "status");
  const status = CONTACT_MESSAGE_STATUSES.includes(statusRaw as ContactMessageStatus)
    ? (statusRaw as ContactMessageStatus)
    : undefined;

  const pageRaw = Number(searchParam(params, "page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const sizeRaw = Number(searchParam(params, "pageSize"));
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw >= 1 ? Math.min(Math.floor(sizeRaw), MAX_PAGE_SIZE) : 20;

  const where = status ? { status } : {};

  const [total, rows, grouped] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    // Tab 角标：全量状态计数（与当前筛选无关）
    prisma.contactMessage.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Record<ContactMessageStatus, number> = {
    new: 0,
    read: 0,
    replied: 0,
    spam: 0,
  };
  for (const g of grouped) {
    if (CONTACT_MESSAGE_STATUSES.includes(g.status as ContactMessageStatus)) {
      counts[g.status as ContactMessageStatus] = g._count._all;
    }
  }

  return json({ items: rows, total, page, pageSize, counts });
});

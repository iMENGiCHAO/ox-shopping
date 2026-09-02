import "server-only";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/server/utils-server";
import { logger } from "@/lib/logger";

/**
 * 审计日志：敏感操作全程留痕(登录、支付、退款、管理端变更等)。
 * 写入失败不阻断业务(仅记录错误日志)。
 */

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  req?: Request | null;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        meta: input.meta ? (input.meta as object) : undefined,
        ip: input.req ? getClientIp(input.req) : undefined,
        userAgent: input.req?.headers.get("user-agent") ?? undefined,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action }, "审计日志写入失败");
  }
}

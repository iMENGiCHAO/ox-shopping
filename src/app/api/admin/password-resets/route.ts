import { apiHandler, searchParam } from "@/lib/api";
import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { parsePagination } from "@/lib/utils";
import type { PasswordResetStatus } from "@prisma/client";
import {
  countPasswordResetsByStatus,
  listPasswordResetRequests,
} from "@/server/services/password-reset.service";

export const runtime = "nodejs";

const STATUSES: PasswordResetStatus[] = ["PENDING", "APPROVED", "REJECTED"];

/**
 * GET /api/admin/password-resets — 找回密码申请列表（B-2 后台待处理列表）
 *
 * 默认按提交时间倒序；`status=PENDING` 即「待处理」视图。
 * 额外返回 `statusCounts`（三态计数，一次 groupBy）供统计卡与角标直接使用，
 * 避免前端再发请求、也避免多次查询读到不同快照。
 */
export const GET = apiHandler(async (req) => {
  await requireStaff();
  const sp = new URL(req.url).searchParams;
  const status = searchParam(sp, "status");
  const q = searchParam(sp, "q");
  const { page, pageSize, skip, take } = parsePagination(sp, { page: 1, pageSize: 10 });

  const [{ rows, total }, statusCounts] = await Promise.all([
    listPasswordResetRequests({
      ...(status && (STATUSES as string[]).includes(status)
        ? { status: status as PasswordResetStatus }
        : {}),
      ...(q ? { q } : {}),
      skip,
      take,
    }),
    countPasswordResetsByStatus(),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    pendingCount: statusCounts.PENDING,
    statusCounts,
  });
});

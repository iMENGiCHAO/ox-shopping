import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ApiError, toApiError } from "@/lib/errors";
import { logError, withRequest } from "@/lib/logger";
import { captureException } from "@/lib/monitoring";
import type { ApiErrorBody, ApiResponse } from "@/types/api";

/** 成功响应：{ data } */
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data } satisfies ApiResponse<T>, init);
}

/** 分页响应 */
export function jsonPaginated<T>(
  data: T[],
  pagination: { page: number; pageSize: number; total: number; totalPages: number },
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json({ data, pagination }, init);
}

/** 错误响应：{ error: { code, message, details } } */
export function jsonError(error: ApiError, init?: ResponseInit): NextResponse {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, details: error.details },
  };
  return NextResponse.json(body, {
    status: error.status,
    ...(init ?? {}),
  });
}

/** Next.js 16：动态路由 params 为 Promise，包装器统一 await 后传给业务 handler。
 * 类型放宽为 Promise<unknown> 以满足 Next 构建期对路由签名（Promise<{}>）的校验。 */
type RouteContext = {
  params: Record<string, string | string[]> | Promise<unknown>;
};

type Handler = (
  req: NextRequest,
  ctx: { params: Record<string, string | string[]> },
) => Promise<Response>;
/** 导出的路由函数签名：兼容 Next 16 传入的 { params: Promise<{}> } */
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;

/**
 * Route Handler 统一包装器：
 * - 结构化错误响应(ApiError/ZodError/未知错误)
 * - 请求日志(requestId 贯穿)
 * - 未知错误上报 Sentry(可选)
 */
export function apiHandler(handler: Handler): RouteHandler {
  return async (req, ctx: RouteContext) => {
    const log = withRequest(req);
    const started = Date.now();
    try {
      const res = await handler(req, {
        params: (await ctx.params) as Record<string, string | string[]>,
      });
      log.info(
        {
          method: req.method,
          url: req.url,
          status: res.status,
          durationMs: Date.now() - started,
        },
        "api ok",
      );
      return res;
    } catch (err) {
      const apiError = toApiError(err);
      logError(err, req, {
        status: apiError.status,
        code: apiError.code,
        durationMs: Date.now() - started,
      });
      if (apiError.status >= 500) {
        captureException(err, { url: req.url, method: req.method });
      }
      return jsonError(apiError);
    }
  };
}

/** 读取并校验 JSON 请求体(自动处理空 body / 解析失败) */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "请求体不是合法的 JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    throw new ApiError(400, "VALIDATION_ERROR", "请求参数不合法", details);
  }
  return parsed.data;
}

/** 读取查询参数中的可选值(trim 后为空返回 undefined) */
export function searchParam(searchParams: URLSearchParams, name: string): string | undefined {
  const v = searchParams.get(name)?.trim();
  return v ? v : undefined;
}

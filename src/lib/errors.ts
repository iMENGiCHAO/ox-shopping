import { ZodError } from "zod";

/** API 错误码(前端可据此做国际化/提示) */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PAYMENT_ERROR"
  | "INTERNAL_ERROR";

/** 统一 API 错误：抛出后由 apiHandler 捕获并序列化 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "请先登录"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "没有权限执行此操作"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "资源不存在"): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, "CONFLICT", message);
}

export function rateLimited(message = "请求过于频繁，请稍后再试"): ApiError {
  return new ApiError(429, "RATE_LIMITED", message);
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return new ApiError(400, "VALIDATION_ERROR", "请求参数不合法", details);
  }
  if (err instanceof Error) {
    return new ApiError(500, "INTERNAL_ERROR", "服务器内部错误");
  }
  return new ApiError(500, "INTERNAL_ERROR", "服务器内部错误");
}

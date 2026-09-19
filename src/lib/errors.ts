import { ZodError } from "zod";

/**
 * 统一 API 错误。
 *
 * ⚠️ 文案语言约定：这里的 `message` 一律写**英文**。
 *   - 英文前台直接使用；
 *   - 中文界面由 `lib/error-i18n` 的 `ERROR_ZH`（英文 key → 中文）在
 *     `apiHandler` 的统一错误出口按请求语言替换。
 * 反面例子：直接写中文，会原样返回给英文站用户（`localizeErrorMessage`
 * 在 lang !== "zh" 时不翻译），属于典型 i18n 泄漏。
 */

/** API 错误码(前端可据此做国际化/提示) */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "CODE_EXISTS"
  | "VALIDATION_ERROR"
  | "CSRF_FAILED"
  | "RATE_LIMITED"
  /* refresh token 被判定为窃取重放（已吊销该用户全部会话）。
     单独成码的原因：调用方需要**按错误码**分支，而不是按文案子串匹配 ——
     文案会随语言/措辞变化，`message.includes("异常登录")` 这种写法一旦
     文案本地化就会静默失效。 */
  | "REPLAY_DETECTED"
  | "PAYMENT_ERROR"
  | "REFUND_FAILED"
  | "PAYMENT_GATEWAY_ERROR"
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

export function unauthorized(message = "Please sign in first"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "You do not have permission to perform this action"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found"): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, "CONFLICT", message);
}

export function rateLimited(message = "Too many requests, please try again later"): ApiError {
  return new ApiError(429, "RATE_LIMITED", message);
}

/**
 * refresh token 重放（401 + `REPLAY_DETECTED` 码）。
 * 调用方**按 code 分支**，不要按 message 子串匹配。
 */
export function replayDetected(
  message = "Suspicious sign-in detected, please sign in again",
): ApiError {
  return new ApiError(401, "REPLAY_DETECTED", message);
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return new ApiError(400, "VALIDATION_ERROR", "Invalid request parameters", details);
  }
  if (err instanceof Error) {
    return new ApiError(500, "INTERNAL_ERROR", "Internal server error");
  }
  return new ApiError(500, "INTERNAL_ERROR", "Internal server error");
}

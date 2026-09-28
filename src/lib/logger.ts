import "server-only";
import pino from "pino";
import { env } from "@/lib/env";
import { REQUEST_ID_HEADER } from "@/lib/constants";

/**
 * pino 结构化日志。
 * 开发环境输出美化格式；生产输出 JSON 供日志采集(K8s/Loki 等)。
 */
/**
 * pino 结构化日志。
 * 始终输出 JSON(pino 的 transport/worker 线程与 Next.js webpack 打包不兼容，
 * 开发环境如需美化可管道接 pino-pretty：npm run dev | npx pino-pretty)。
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "ecommerce" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // 安全审计修复：REDACT 兜底 —— 任何误把凭据/PII 放进日志对象字段的调用点，
  // 在此统一抹除，不依赖每个调用者自觉（收件人邮箱已在 mail 层脱敏，这里是第二道闸）。
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "authorization",
      "*.authorization",
      "cookie",
      "*.cookie",
      "secret",
      "*.secret",
      "apiKey",
      "*.apiKey",
      "email",
      "*.email",
      "phone",
      "*.phone",
    ],
    censor: "[REDACTED]",
  },
});

/** 从请求头提取请求 ID(由 middleware 注入) */
export function getRequestId(req?: Request | null): string | undefined {
  return req?.headers.get(REQUEST_ID_HEADER) ?? undefined;
}

/** 带请求 ID 上下文的子 logger */
export function withRequest(req?: Request | null): pino.Logger {
  const requestId = getRequestId(req);
  return requestId ? logger.child({ requestId }) : logger;
}

/** 统一错误日志 */
export function logError(err: unknown, req?: Request | null, context?: Record<string, unknown>) {
  const log = withRequest(req);
  if (err instanceof Error) {
    log.error({ err: { message: err.message, stack: err.stack }, ...context }, "request failed");
  } else {
    log.error({ err, ...context }, "request failed");
  }
}

/**
 * API 请求失败日志（按状态分级，避免预期内的客户端错误刷屏）：
 * - 5xx 服务端错误：error + 完整堆栈（需排查）
 * - 401/403 未登录/无权限：debug（访客每次轮询都会触发，属正常噪音）
 * - 其他 4xx 客户端错误：warn，只记消息不打堆栈
 */
export function logApiFailure(
  err: unknown,
  req: Request | null | undefined,
  context: { status: number } & Record<string, unknown>,
) {
  const log = withRequest(req);
  const message = err instanceof Error ? err.message : String(err);
  if (context.status >= 500) {
    log.error(
      { err: err instanceof Error ? { message: err.message, stack: err.stack } : err, ...context },
      "request failed",
    );
  } else if (context.status === 401 || context.status === 403) {
    log.debug({ message, ...context }, "request rejected");
  } else {
    log.warn({ message, ...context }, "request rejected");
  }
}

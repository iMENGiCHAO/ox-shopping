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

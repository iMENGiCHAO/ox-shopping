import "server-only";
import * as Sentry from "@sentry/node";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Sentry(可选)：配置 SENTRY_DSN 后启用。
 * 采用轻量接入(@sentry/node)，不侵入 Next.js 构建管线；
 * 如需完整链路追踪可后续引入 @sentry/nextjs。
 */

let initialized = false;

function ensureInit() {
  if (initialized || !env.SENTRY_DSN) return;
  try {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      release: env.SENTRY_RELEASE || process.env.npm_package_version || "1.0.0",
      // 不采集请求体、Cookie 或用户 PII；业务上下文只放经显式脱敏的 extra。
      sendDefaultPii: false,
      maxBreadcrumbs: 50,
    });
    initialized = true;
    logger.info(
      {
        sentryEnvironment: env.SENTRY_ENVIRONMENT,
        sentryRelease: env.SENTRY_RELEASE || process.env.npm_package_version || "1.0.0",
        timezone: env.APP_TIMEZONE,
      },
      "sentry enabled",
    );
  } catch (err) {
    logger.warn({ err }, "sentry init failed");
  }
}

/** 捕获异常(未配置 Sentry 时仅记录日志，绝不抛出) */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  ensureInit();
  try {
    Sentry.captureException(error, { extra: context });
  } catch {
    /* noop */
  }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info"): void {
  if (!env.SENTRY_DSN) return;
  ensureInit();
  try {
    Sentry.captureMessage(message, level);
  } catch {
    /* noop */
  }
}

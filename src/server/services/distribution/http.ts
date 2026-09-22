import "server-only";
import { notFound } from "@/lib/errors";
import { isDistributionEnabled } from "@/lib/distribution/contract";

/**
 * 分销接口的统一前置守卫。
 *
 * `DISTRIBUTION_ENABLED=false` 时整个模块的 HTTP 面**彻底消失**（404），
 * 而不是返回 403/空数据 —— 关闭就该像没装过这个模块一样，避免留下可探测的
 * 端点与"半开"状态。
 */
export function assertDistributionEnabled(): void {
  if (!isDistributionEnabled()) throw notFound();
}

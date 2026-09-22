import "server-only";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { DIST_REF_COOKIE_TTL_DAYS, isDistributionEnabled } from "@/lib/distribution/contract";
import { verifyRefCookie } from "@/lib/distribution/referral";

/**
 * 商城 ↔ 分销 的**唯一接口面**（大爷要求「隔离、解耦、接口调用」）。
 *
 * 三条铁律（改这里之前先读）：
 *   1. **商城只 import 本文件**，永远不 import 分销 service 内部实现；
 *   2. **异常一律吞掉**：分销模块的任何失败（DB 抖动、规则配置错误、代码 bug）
 *      都不允许影响下单、支付、发货、退款 —— 这些是商城的生命线；
 *   3. **开关即隔离**：`DISTRIBUTION_ENABLED=false` 时所有钩子立即返回，
 *      商城行为与接入前逐字节一致。
 *
 * 实现用**动态 import** 懒加载：即便分销模块本身存在编译/循环依赖问题，
 * 也不会出现在商城的启动路径上（把风险限制在"功能不可用"，而不是"站点起不来"）。
 *
 * 注意：钩子是「尽力而为」的**加速器**，不是正确性的唯一保证。
 * 真正兜底的是 `reconcileDistribution()` —— 调度器每分钟扫平漏记/漏冲正，
 * 所以这里即使整段失败，最终账也会被补齐。
 */

const REF_COOKIE_TTL_MS = DIST_REF_COOKIE_TTL_DAYS * 86_400_000;

/** 从原始 cookie 值解析推广码（校验签名与有效期，失败返回 null） */
function codeFromCookie(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return verifyRefCookie(raw, REF_COOKIE_TTL_MS)?.code ?? null;
  } catch {
    return null;
  }
}

export const distributionBridge = {
  /** 分销模块是否启用（商城侧可用于隐藏入口） */
  enabled(): boolean {
    return isDistributionEnabled();
  },

  /** 注册成功后：按配置绑定推广人（`bindTrigger=register`），并可能让对方自动升级 */
  async onUserRegistered(input: {
    userId: string;
    refCookie?: string | null;
    req?: NextRequest;
  }): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const code = codeFromCookie(input.refCookie);
      if (!code) return;
      const { bindOnRegister } = await import("./bind.service");
      await bindOnRegister({
        userId: input.userId,
        code,
        ...(input.req ? { req: input.req } : {}),
      });
    } catch (err) {
      logger.error({ err, userId: input.userId }, "分销：注册绑定钩子失败（已忽略）");
    }
  },

  /** 订单创建成功后：写归属快照（自然流量订单也会落一条 natural 记录） */
  async onOrderCreated(input: {
    orderId: string;
    userId: string | null;
    refCookie?: string | null;
    req?: NextRequest;
  }): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const code = codeFromCookie(input.refCookie);
      const { attributeOrder } = await import("./bind.service");
      await attributeOrder({
        orderId: input.orderId,
        userId: input.userId,
        code,
        ...(input.req ? { req: input.req } : {}),
      });
    } catch (err) {
      logger.error({ err, orderId: input.orderId }, "分销：订单归属钩子失败（已忽略）");
    }
  },

  /** 订单支付成功：计提逐级佣金（幂等） */
  async onOrderPaid(orderId: string, req?: NextRequest): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const { accrueForOrder } = await import("./commission.service");
      await accrueForOrder(orderId, req);
    } catch (err) {
      logger.error({ err, orderId }, "分销：佣金计提钩子失败（已忽略）");
    }
  },

  /** 订单确认收货：立即结算该订单佣金（不必等持有期） */
  async onOrderDelivered(orderId: string): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const { settleOrder } = await import("./commission.service");
      await settleOrder(orderId);
    } catch (err) {
      logger.error({ err, orderId }, "分销：佣金结算钩子失败（已忽略）");
    }
  },

  /**
   * 订单退款/取消（含**部分退款**）：按当前累计退款比例增量冲正佣金。
   * 内部幂等，重复调用（退款流程 + 每分钟对账）不会重复扣。
   */
  async onOrderRefunded(orderId: string): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const { syncOrderReversal } = await import("./commission.service");
      await syncOrderReversal(orderId, "订单退款/取消（商城钩子触发）");
    } catch (err) {
      logger.error({ err, orderId }, "分销：佣金冲正钩子失败（已忽略）");
    }
  },

  /** 调度器心跳：对账补偿（漏记归属/漏算佣金/漏冲正/待结算） */
  /**
   * 团队业绩日汇总（P2-12）：幂等可重跑，调度器每小时调一次保持当日数据新鲜。
   * 同样走 bridge 隔离：模块被关掉时什么也不做。
   */
  async runRollup(): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const { rollupDistributionDailyStats } = await import("./report.service");
      await rollupDistributionDailyStats({ days: 2 });
    } catch (err) {
      logger.error({ err }, "分销：团队业绩日汇总失败（已忽略，下轮重试）");
    }
  },

  async runReconcile(): Promise<void> {
    if (!isDistributionEnabled()) return;
    try {
      const { reconcileDistribution } = await import("./report.service");
      await reconcileDistribution();
    } catch (err) {
      logger.error({ err }, "分销：对账补偿失败（已忽略，下轮重试）");
    }
  },
};

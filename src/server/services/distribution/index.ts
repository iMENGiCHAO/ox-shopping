/**
 * 分销模块**服务门面**。
 *
 * 只有分销自己的 API（`/api/distribution/**` 与 `/api/admin/distribution/**`）
 * 与定时任务允许从本入口 import；
 * **商城代码一律走 `bridge.ts`**（隔离 + 可开关 + 异常隔离），不要从这里拿东西。
 */
export * from "./config.service";
export * from "./relation.service";
export * from "./bind.service";
export * from "./commission.service";
export * from "./account.service";
export * from "./report.service";

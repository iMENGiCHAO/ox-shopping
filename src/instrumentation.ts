/**
 * Next 16 服务器引导钩子（file convention，v15 起稳定；约定见
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md）。
 *
 * 此前的两个引导缺口（运维/文档审计）：
 * 1. **Sentry 懒初始化**：ensureInit 只在「首个 API 报错走到 apiHandler」时执行，
 *    页面渲染（RSC）崩溃只进 error boundary 的客户端 console.error —— 生产上
 *    整类页面 5xx 对 Sentry 完全不可见。register() 启动即初始化；
 *    onRequestError 钩子把**服务端捕获的所有错误**（含 RSC 渲染崩溃）上报。
 * 2. **cron 懒启动**：调度器靠 prisma 单例首次 import 拉起 —— 冷启动后到第一个
 *    请求前，订单超时取消/退款重试/掉单对账全部不跑。register() 启动即拉起
 *    （startScheduler 自带 globalThis 幂等守卫，与原路径共存不冲突）。
 *
 * 类型说明：`Instrumentation` 命名空间未从 "next" 公开导出（docs 示例与
 * 16.3.6 实际不符）—— 下方 onRequestError 按
 * next/dist/server/instrumentation/types.d.ts 的 InstrumentationOnRequestError
 * 结构书写，Next 加载时会按该模块类型兜底校验。
 */

export async function register(): Promise<void> {
  // 仅 Node 服务端运行时；edge/其它 runtime 下这些模块不可用
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureInit } = await import("@/lib/monitoring");
  ensureInit();
  const { startScheduler } = await import("@/server/jobs/start");
  startScheduler();
}

/**
 * 服务端错误统一上报：Next 在服务端捕获的渲染/路由错误都会走到这里
 * （含 RSC 崩溃 —— error.digest 可与客户端上报关联）。
 *
 * PII 纪律：请求对象只有 path/method/headers，本函数只取 path 与 method
 * （搜索/订单查询的 query 不随错误上报），与 logger 的脱敏口径一致。
 */
export const onRequestError = async (
  error: unknown,
  request: Readonly<{
    path: string;
    method: string;
    headers: NodeJS.Dict<string | string[]>;
  }>,
  context: Readonly<{
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "proxy";
    renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
    revalidateReason?: "on-demand" | "stale";
  }>,
): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureException } = await import("@/lib/monitoring");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;
  captureException(error, {
    digest,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};

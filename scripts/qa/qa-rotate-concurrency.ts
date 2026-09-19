/**
 * 刷新令牌「复用」行为验收 —— 两个场景，覆盖真实世界会踩到的两条路径。
 *
 * 背景：`proxy.ts` 在 access token 失效时对**每个**请求调用 `rotateSession`，
 * 而同一页面会并发发出多个 API 请求，它们带着**同一个** refresh token。
 * 原实现只认「链未闭合」这一种善意情形，导致「被吊销且无后继」的 token
 * 再次出现时被判定为窃取重放 → **吊销该用户全部会话**（用户被强制登出）。
 *
 * 场景 A（紧并发）：N 个请求同时到达，都读到「后继未使用」→ 链未闭合 → 善意。
 *   这条路径原本就没问题，用于确认没有回归。
 *
 * 场景 B（陈旧 Cookie，**原缺陷的确定性复现**）：
 *   1. rotate(R1) → R2            （R1.replacedBy = R2）
 *   2. rotate(R1) → R3            （善意重试，回收 R2 ⇒ R2.revokedAt 有值、replacedBy 为空）
 *   3. 浏览器 Cookie 里留下的是 **R2**（并发响应覆盖顺序导致），于是下一次请求带着 R2
 *      → R2 已吊销、且 **无后继** ⇒ 链已闭合 ⇒ 原实现判重放、吊销全部会话。
 *   宽限期修好后：R2 是「刚被吊销」的，落在宽限期内 → 按并发/重试处理，会话存活。
 *
 * 断言（两个场景共同）：
 *   - 不出现 "Suspicious sign-in detected"
 *   - 结束后该用户仍有 ≥1 个未吊销、未过期的 refresh token
 *
 * 运行：NODE_OPTIONS=--conditions=react-server npx tsx scripts/qa/qa-rotate-concurrency.ts
 *   `--conditions=react-server` 必需：`lib/auth/session.ts` 带 `import "server-only"`，
 *   该包在默认条件下会主动抛错，只有 react-server 条件才解析到空模块。
 *   本仓库无 `"type": "module"`，tsx 按 CJS 处理 → 不能用顶层 await。
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

const N = 5;
const isReplay = (r: PromiseRejectedResult) =>
  /Suspicious sign-in/i.test(String(r.reason?.message ?? ""));

async function main() {
  const { issueSession, rotateSession } = await import("@/lib/auth/session");
  const prisma = new PrismaClient();
  const failures: string[] = [];

  try {
    const user = await prisma.user.findFirst({
      where: { status: "ACTIVE" },
      select: { id: true, email: true, name: true, role: true, status: true, emailVerified: true },
    });
    if (!user) {
      console.error("❌ 库中没有 ACTIVE 用户，无法测试");
      process.exit(1);
    }
    console.log(`测试用户：${user.email} (${user.id})\n`);

    const reset = () => prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    const aliveCount = () =>
      prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });

    /* ── 场景 A：N 个请求紧并发携带同一个 R1 ───────────────────── */
    await reset();
    const a1 = await issueSession(user);
    const aResults = await Promise.allSettled(
      Array.from({ length: N }, () => rotateSession(a1.refreshToken)),
    );
    const aOk = aResults.filter((r) => r.status === "fulfilled").length;
    const aReplay = (aResults.filter((r) => r.status === "rejected") as PromiseRejectedResult[]).filter(
      isReplay,
    );
    const aAlive = await aliveCount();
    console.log("场景 A（紧并发，同一 R1）");
    console.log(`  成功 ${aOk} / ${N}    误判重放 ${aReplay.length}    会话存活 token ${aAlive}`);
    if (aReplay.length) failures.push(`A：出现 ${aReplay.length} 次误判重放`);
    if (aAlive === 0) failures.push("A：会话被全部吊销");

    /* ── 场景 B：陈旧 Cookie（被吊销且无后继）──────────────────── */
    await reset();
    const b1 = await issueSession(user);
    const R1 = b1.refreshToken;

    // 1) R1 → R2
    const step1 = await rotateSession(R1);
    const R2 = step1.refreshToken;
    // 2) 再次携带 R1（善意重试）→ 回收 R2、签发 R3
    const step2 = await rotateSession(R1);
    const R3 = step2.refreshToken;

    const r2row = await prisma.refreshToken.findUnique({
      where: { tokenHash: await (await import("@/lib/utils")).sha256(R2) },
      select: { revokedAt: true, replacedBy: true },
    });
    console.log("\n场景 B（陈旧 Cookie）");
    console.log(
      `  构造完成：R2 已吊销=${!!r2row?.revokedAt}  R2 无后继=${!r2row?.replacedBy}  R3 已签发=${!!R3}`,
    );

    // 3) 浏览器 Cookie 里留下的是 R2 → 下一次请求带着它
    const bResults = await Promise.allSettled([rotateSession(R2)]);
    const bReplay = (bResults.filter((r) => r.status === "rejected") as PromiseRejectedResult[]).filter(
      isReplay,
    );
    const bAlive = await aliveCount();
    console.log(`  携带 R2 请求：误判重放 ${bReplay.length}    会话存活 token ${bAlive}`);
    if (bReplay.length) {
      failures.push("B：陈旧 Cookie 被误判为重放（原缺陷）");
    }
    if (bAlive === 0) failures.push("B：会话被全部吊销 —— 用户会被强制登出");

    /* ── 收尾 ──────────────────────────────────────────────────── */
    await reset();

    if (failures.length) {
      console.log("\n❌ 失败：");
      failures.forEach((f) => console.log("   " + f));
      process.exitCode = 1;
      return;
    }
    console.log("\n✅ 两个场景均未触发误判重放，会话保持存活");
  } finally {
    await prisma.$disconnect();
  }
}

void main();

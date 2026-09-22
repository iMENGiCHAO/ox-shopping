import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { callApi, getData, registerAndLogin, CookieJar, testClientKey } from "../helpers/api";
import { prisma } from "@/lib/prisma";
import { REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { sha256 } from "@/lib/utils";
import { resetRateLimit } from "@/lib/rate-limit";

/**
 * refresh token 轮换的**复用策略**回归测试。
 *
 * 历史：这里原本只覆盖「链未闭合的善意重试」一种情形，并断言
 * 「被吊销且无后继的 token 再次出现 = 窃取重放 → 吊销全部会话」。
 *
 * 2026-09-19 生产日志证明那条策略**不可商用**：
 * 同一 userId 在 12 秒内触发 12 次「refresh token 重放，已吊销该用户全部会话」，
 * 后台看板随即 401。原因是 `proxy.ts` 在 access token 失效时对**每个**请求调用
 * `rotateSession`，而一个页面会并发发出多个请求、带着**同一个** refresh token：
 *
 *   Req1: A → B（A.revokedAt = now, A.replacedBy = B）
 *   Req2: 复用 A，B 未使用 ⇒ 链未闭合 ⇒ 善意重试 ⇒ 回收 B、签发 C
 *   Req3: 复用 A，B 已被 Req2 回收 ⇒ 链已闭合 ⇒ **判重放、吊销全部会话** ❌
 *
 * 另一条同样会触发的路径：并发响应覆盖 Cookie 顺序，客户端留下的是
 * 「已被吊销且无后继」的 B ⇒ 下一次请求直接命中重放分支。
 *
 * 现策略（见 `lib/auth/session.ts` 的 `ROTATION_REUSE_GRACE_MS`）：
 * 「链未闭合」**或**「旧 token 在刚被轮换后的 60 秒宽限期内」都按善意复用处理。
 * 宽限期外的链已闭合复用**仍然是真重放**，照旧吊销全部会话。
 *
 * 因此本文件断言的三件事：
 *   1. 链未闭合的善意重试 → 200，不殃及其它设备
 *   2. 宽限期内的并发复用 → 全部 200，会话存活（生产缺陷的回归护栏）
 *   3. 超出宽限期 + 链已闭合 → 401 且吊销全部（安全底线未被放宽掉）
 */

const unique = () => `rot-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** 宽限期（毫秒）—— 与 `lib/auth/session.ts` 的常量保持一致 */
const GRACE_MS = 60_000;

async function importRefresh() {
  return await import("@/app/api/auth/refresh/route");
}

async function doRefresh(refreshToken: string) {
  const { POST } = await importRefresh();
  return callApi(POST, {
    method: "POST",
    cookies: { [REFRESH_TOKEN_COOKIE]: refreshToken },
  });
}

/** 把某条 refresh token 记录的 revokedAt 往前挪，用于越过宽限期做真重放测试 */
async function backdateRevocation(refreshToken: string, ageMs: number) {
  const tokenHash = await sha256(refreshToken);
  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revokedAt: new Date(Date.now() - ageMs) },
  });
}

describe("refresh token 复用策略", () => {
  const emails: string[] = [];

  beforeEach(async () => {
    // 集成测试跑在**同一个进程**里（vitest `singleFork: true`），限流桶是全局共享的：
    //   register 3 次/60s/IP（外加 register:global 100 次/小时）、refresh 10 次/60s/IP，
    //   而本文件 4 个用例共注册 4 次、刷新 12 次 —— 不重置就会被自己限流拿到 429，
    //   与轮换逻辑无关，属测试噪声。
    //
    // 注意 IP 取值：测试客户端固定带 `x-forwarded-for: 127.0.0.1`（tests/helpers/api.ts），
    // 但 `env.TRUST_PROXY` 在**非生产环境默认为 false**（src/lib/env.ts），
    // 此时 getClientIp 会忽略 XFF 并返回 "unknown"。两种取值都重置，避免依赖环境。
    for (const ip of ["127.0.0.1", "unknown", testClientKey()]) {
      await resetRateLimit(`register:${ip}`);
      await resetRateLimit(`refresh:${ip}`);
    }
    // 全局注册熔断（100/小时）是防滥用的生产护栏，在测试里跨文件累积会误伤后续用例。
    // 注意键名：B1 之后熔断桶是端点级 `register:__global__`（旧键 register:global 已废弃）。
    await resetRateLimit("register:__global__");
  });

  afterEach(async () => {
    for (const email of emails) await prisma.user.deleteMany({ where: { email } });
    emails.length = 0;
  });

  it("链未闭合的善意重试：不被吊销全部会话，仍返回可用会话", async () => {
    const email = unique();
    emails.push(email);
    const r = await registerAndLogin(email);
    const tokenA = r.jar.get(REFRESH_TOKEN_COOKIE)!;
    expect(tokenA).toBeTruthy();

    // 第一次轮换：A → B（服务端标 A.replacedBy = hashB，B 为"未使用"）
    const first = await doRefresh(tokenA);
    expect(first.status).toBe(200);
    const firstJar = new CookieJar();
    firstJar.absorb(first);
    const tokenB = firstJar.get(REFRESH_TOKEN_COOKIE);
    expect(tokenB).toBeTruthy();

    // 模拟"客户端未收到响应、仍持旧 token A 重发"（善意重试）
    const retry = await doRefresh(tokenA);
    expect(retry.status).toBe(200);
    const retryJar = new CookieJar();
    retryJar.absorb(retry);
    expect(retryJar.get(REFRESH_TOKEN_COOKIE)).toBeTruthy();

    // 重建的会话可用
    const retryUser = (await getData(retry)) as { user: { email: string } };
    expect(retryUser.user.email).toBe(email);
  });

  it("宽限期内的并发复用：全部成功，且不吊销全部会话（生产缺陷回归护栏）", async () => {
    const email = unique();
    emails.push(email);
    const r = await registerAndLogin(email);
    const tokenA = r.jar.get(REFRESH_TOKEN_COOKIE)!;

    // 同一个 A 被 4 个并发请求携带 —— 复现真实页面（后台看板会并发轮询多个接口）
    const results = await Promise.all([1, 2, 3, 4].map(() => doRefresh(tokenA)));

    // 修复前：第 3 个请求起就会 401「检测到异常登录」并把全部会话吊销
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // 关键：会话必须仍然存活（修复前这里会是 0，用户被强制登出）
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const active = await prisma.refreshToken.count({
      where: { userId: user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(active).toBeGreaterThan(0);
  });

  it("超出宽限期且链已闭合的复用：仍判真重放并吊销全部会话", async () => {
    const email = unique();
    emails.push(email);
    const r = await registerAndLogin(email);
    const tokenA = r.jar.get(REFRESH_TOKEN_COOKIE)!;

    // A → B
    const first = await doRefresh(tokenA);
    expect(first.status).toBe(200);
    const jar1 = new CookieJar();
    jar1.absorb(first);
    const tokenB = jar1.get(REFRESH_TOKEN_COOKIE)!;

    // B → C（B 被标记 replacedBy，链闭合：原客户端确实拿到了 B 并继续前进）
    const second = await doRefresh(tokenB);
    expect(second.status).toBe(200);

    // 把 A 的吊销时间往前挪过宽限期 —— 此时 A 再现只能是窃取重放
    await backdateRevocation(tokenA, GRACE_MS * 2);

    const replay = await doRefresh(tokenA);
    expect(replay.status).toBe(401);

    // 全部会话已被吊销
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const active = await prisma.refreshToken.count({
      where: { userId: user!.id, revokedAt: null },
    });
    expect(active).toBe(0);
  });

  it("轮换出的新 token 可正常继续使用（未因宽限期逻辑误伤）", async () => {
    const email = unique();
    emails.push(email);
    const r = await registerAndLogin(email);
    const tokenA = r.jar.get(REFRESH_TOKEN_COOKIE)!;

    const first = await doRefresh(tokenA);
    expect(first.status).toBe(200);
    const jar = new CookieJar();
    jar.absorb(first);
    const tokenB = jar.get(REFRESH_TOKEN_COOKIE)!;

    // 正常前进：B 未被吊销、未被替换 → 应走正常轮换分支
    const second = await doRefresh(tokenB);
    expect(second.status).toBe(200);

    // 响应体返回当前用户；新 token 通过 Set-Cookie 下发
    const payload = (await getData(second)) as { user: { email: string } };
    expect(payload.user.email).toBe(email);
  });
});

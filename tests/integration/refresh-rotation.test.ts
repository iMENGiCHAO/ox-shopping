import { describe, expect, it, afterEach } from "vitest";
import { callApi, getData, registerAndLogin, CookieJar } from "../helpers/api";
import { prisma } from "@/lib/prisma";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/**
 * P0-1：refresh token 轮换「链断裂」竞态回归测试。
 *
 * 场景：轮换 A→B 提交成功，但客户端在收到响应前断网，浏览器仍持旧 token A 并重发。
 * 旧实现把它当作窃取重放 → revokeAllUserTokens 把用户全部设备登出。
 * 修复后：只有当后继 token B 已被再次轮换（链闭合）才视为真重放；B 仍"未使用"时为
 * 善意重试，仅重建当前会话、不殃及其它设备。
 */

const unique = () => `rot-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

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

describe("refresh token 轮换竞态（P0-1）", () => {
  const emails: string[] = [];

  afterEach(async () => {
    for (const email of emails) await prisma.user.deleteMany({ where: { email } });
    emails.length = 0;
  });

  it("善意重试（旧 token 重发且后继未使用）不被吊销全部会话，仍返回可用会话", async () => {
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
    // 关键断言：不再 401 + 吊销全部；而是 200 返回一条全新可用会话
    expect(retry.status).toBe(200);
    const retryJar = new CookieJar();
    retryJar.absorb(retry);
    const tokenC = retryJar.get(REFRESH_TOKEN_COOKIE);
    expect(tokenC).toBeTruthy();

    // 善意重试重建的会话仍可用：用其 access token 访问 /me 应 200
    const retryUser = (await getData(retry)) as { user: { email: string } };
    expect(retryUser.user.email).toBe(email);

    // 善意重试时「卡住的后继 B」应被吊销（客户端本就没收到 B，B 不应再可用），
    // 这正是修复的语义：吊销的是 B 这一条，而不是 revokeAllUserTokens 把全部设备端了。
    const still = await doRefresh(tokenB!);
    expect(still.status).toBe(401);
  });

  it("真重放（链闭合后旧 token 再现）仍吊销全部会话", async () => {
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

    // B → C（此时 B 被标记 replacedBy，链闭合：原客户端确实拿到了 B 并继续前进）
    const second = await doRefresh(tokenB);
    expect(second.status).toBe(200);

    // 现在旧 token A 再现 = 窃取重放 → 应吊销全部（401 异常登录）
    const replay = await doRefresh(tokenA);
    expect(replay.status).toBe(401);

    // 吊销全部后，即便再拿 B 的 access 也已失效；此处校验 refresh 记录已被吊销
    // （B 已随 revokeAll 被标记 revokedAt 或已被第二条链轮换，均可视为不可再用）
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const active = await prisma.refreshToken.count({
      where: { userId: user!.id, revokedAt: null },
    });
    expect(active).toBe(0);
  });
});
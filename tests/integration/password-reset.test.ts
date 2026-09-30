import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CookieJar, callApi, getData, login, registerAndLogin, testClientKey } from "../helpers/api";
import { prisma } from "@/lib/prisma";
import { resetRateLimit } from "@/lib/rate-limit";
import { passwordSchema } from "@/lib/auth/password";
import {
  ACCESS_TOKEN_COOKIE,
  PASSWORD_CHANGE_REQUIRED_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/constants";

/**
 * B-2 原站式找回密码（人工审批流）端到端集成测试。
 *
 * 覆盖的是**闭环**而不是单个接口：提交申请 → 后台待处理 → 批准 → 邮件下发强随机
 * 临时密码 → 旧会话全部失效 → 首登被强制改密 → 改密后恢复正常；另含驳回分支与
 * 幂等/防重复。任何一环断掉，用户都会卡在「有邮箱但进不去」的状态。
 */

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Admin@123456";
const USER_PASSWORD = "User@123456";
const NEW_PASSWORD = "BrandNew@2026";

const SUITE_TAG = `pwreset-${Date.now()}`;
const uniqueEmail = () => `${SUITE_TAG}-${Math.random().toString(36).slice(2, 8)}@test.local`;

function cookieRecord(jar: CookieJar): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, PASSWORD_CHANGE_REQUIRED_COOKIE]) {
    const v = jar.get(name);
    if (v) cookies[name] = v;
  }
  return cookies;
}

/** 走真实路由提交找回密码申请 */
async function submitRequest(email: string): Promise<Response> {
  const { POST } = await import("@/app/api/auth/forgot-password/route");
  return callApi(POST, { method: "POST", body: { email } });
}

/**
 * 建账号并返回真实用户 id。
 * 注意 `registerAndLogin()` 的 `user` 字段是接口信封里的 `data`（形如
 * `{ user: {...} }`），直接用 `user.id` 会拿到 undefined —— 这里统一拆一层。
 */
async function registerUser(email: string): Promise<{ id: string; email: string }> {
  const { user } = await registerAndLogin(email);
  return (user as unknown as { user: { id: string; email: string } }).user;
}

async function adminLogin(): Promise<CookieJar> {
  // 多用例共用同一管理员账号，单邮箱 5 次/分钟的限流会跨用例累积 → 每用例独立计数
  for (const ip of ["unknown", "127.0.0.1", testClientKey()]) await resetRateLimit(`login:${ip}:${ADMIN_EMAIL}`);
  const { jar } = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  return jar;
}

async function latestRequest(userId: string) {
  const row = await prisma.passwordResetRequest.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
  if (!row) throw new Error("未找到找回密码申请");
  return row;
}

async function handleRequest(
  adminJar: CookieJar,
  id: string,
  body: { action: "approve" | "reject"; note?: string },
): Promise<Response> {
  const { POST } = await import("@/app/api/admin/password-resets/[id]/route");
  return callApi(POST, {
    method: "POST",
    cookies: cookieRecord(adminJar),
    params: { id },
    body,
  });
}

beforeEach(async () => {
  // 限流是跨用例共享的进程内计数（IP 3 次/分钟），不清会互相干扰：
  //   - forgot：单 IP 3 次/分钟
  //   - register：单 IP 3 次/分钟（本文件每个用例都要建账号）
  // IP 口径：TRUST_PROXY 未开时 getClientIp() 返回 "unknown"（不是 127.0.0.1），
  // 两个都清才对得上（与 cron-jobs.test.ts 同一处理）。
  for (const ip of ["unknown", "127.0.0.1", testClientKey()]) {
    await resetRateLimit(`forgot:${ip}`);
    await resetRateLimit(`register:${ip}`);
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: SUITE_TAG } } });
  await prisma.notification.deleteMany({
    where: { link: "/admin/password-resets", createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
});

describe("找回密码申请提交（防枚举）", () => {
  it("已注册邮箱：落库 PENDING 并通知管理员", async () => {
    const email = uniqueEmail();
    const user = await registerUser(email);
    await resetRateLimit(`forgot-email:${email}`);

    const res = await submitRequest(email);
    expect(res.status).toBe(200);
    const data = await getData<{ ok: boolean; message: string }>(res);
    expect(data.ok).toBe(true);

    const row = await latestRequest(user.id);
    expect(row.status).toBe("PENDING");
    expect(row.email).toBe(email);
    expect(row.handledAt).toBeNull();

    const notify = await prisma.notification.findFirst({
      where: { link: "/admin/password-resets" },
      orderBy: { createdAt: "desc" },
    });
    expect(notify).not.toBeNull();
  });

  it("未注册邮箱：同样 200 同一句回执，且不产生任何申请（防枚举）", async () => {
    const email = `nonexistent-${Date.now()}@test.local`;
    await resetRateLimit(`forgot-email:${email}`);

    const res = await submitRequest(email);
    expect(res.status).toBe(200);
    const data = await getData<{ ok: boolean; message: string }>(res);
    expect(data.ok).toBe(true);
    // 回执必须与已注册邮箱完全一致，且不能泄漏 created 之类的分支信号。
    // 回执源串为英文（i18n 约定：英文是默认语言，中文由前端 t() 渲染）
    expect(data.message).toContain("If this email is registered");
    expect(data).not.toHaveProperty("pending");
    expect(data).not.toHaveProperty("created");

    const count = await prisma.passwordResetRequest.count({ where: { email } });
    expect(count).toBe(0);
  });

  it("重复提交不产生第二份在途申请", async () => {
    const email = uniqueEmail();
    const user = await registerUser(email);
    await resetRateLimit(`forgot-email:${email}`);

    await submitRequest(email);
    await submitRequest(email);

    const pendings = await prisma.passwordResetRequest.count({
      where: { userId: user.id, status: "PENDING" },
    });
    expect(pendings).toBe(1);
  });
});

describe("找回密码审批闭环", () => {
  it("批准 → 临时密码可用 → 旧密码/旧会话失效 → 首登强制改密 → 改密后恢复", async () => {
    const email = uniqueEmail();
    const user = await registerUser(email);
    await resetRateLimit(`forgot-email:${email}`);

    // 旧会话（批准后必须被吊销）
    const { jar: oldJar } = await login(email, USER_PASSWORD);
    expect(oldJar.get(ACCESS_TOKEN_COOKIE)).toBeTruthy();

    await submitRequest(email);
    const row = await latestRequest(user.id);
    const adminJar = await adminLogin();

    // ── 后台待处理列表能看到它 ──
    const { GET } = await import("@/app/api/admin/password-resets/route");
    const listRes = await callApi(GET, {
      cookies: cookieRecord(adminJar),
      headers: { "x-test-url": "/?status=PENDING&pageSize=50" },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      data: Array<{ id: string }>;
      pendingCount: number;
    };
    expect(list.data.some((r) => r.id === row.id)).toBe(true);
    expect(list.pendingCount).toBeGreaterThan(0);

    // ── 批准 ──
    const approveRes = await handleRequest(adminJar, row.id, { action: "approve" });
    expect(approveRes.status).toBe(200);
    const approved = await getData<{
      action: string;
      email: string;
      tempPassword: string;
      mailConfigured: boolean;
    }>(approveRes);
    expect(approved.action).toBe("approve");
    expect(approved.email).toBe(email);
    // 临时密码必须是能通过服务端强度校验的强随机串，否则用户改不了密
    expect(passwordSchema.safeParse(approved.tempPassword).success).toBe(true);
    expect(approved.tempPassword).toHaveLength(14);
    // 测试环境 MAIL_PROVIDER=console，如实回执「邮件未真正投递」
    expect(approved.mailConfigured).toBe(false);

    // ── DB 状态 ──
    const afterApprove = await latestRequest(user.id);
    expect(afterApprove.status).toBe("APPROVED");
    expect(afterApprove.handledAt).not.toBeNull();
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(dbUser.mustChangePassword).toBe(true);
    // 数据库里**只有哈希**，明文不落库
    expect(dbUser.passwordHash).not.toContain(approved.tempPassword);

    // ── 旧会话/旧密码全部失效 ──
    const liveTokens = await prisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(liveTokens).toBe(0);

    const oldLogin = await login(email, USER_PASSWORD);
    expect(oldLogin.response.status).toBe(401);

    // ── 临时密码可登录，但会话被钉在强制改密 ──
    const { response: tempLoginRes, jar: forcedJar } = await login(email, approved.tempPassword);
    expect(tempLoginRes.status).toBe(200);
    const tempLoginUser = (await getData<{ user: { mustChangePassword: boolean } }>(tempLoginRes))
      .user;
    expect(tempLoginUser.mustChangePassword).toBe(true);
    expect(forcedJar.get(PASSWORD_CHANGE_REQUIRED_COOKIE)).toBe("1");

    // /api/auth/me 放行（改密页需要知道当前账号）
    const meGet = (await import("@/app/api/auth/me/route")).GET;
    const meRes = await callApi(meGet, { cookies: cookieRecord(forcedJar) });
    expect(meRes.status).toBe(200);

    // 其它业务接口一律 403 PASSWORD_CHANGE_REQUIRED
    const profileGet = (await import("@/app/api/user/profile/route")).GET;
    const blocked = await callApi(profileGet, { cookies: cookieRecord(forcedJar) });
    expect(blocked.status).toBe(403);
    const blockedBody = (await blocked.json()) as { error: { code: string } };
    expect(blockedBody.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    // 登出也必须放行（否则用户被钉死）
    const logoutPost = (await import("@/app/api/auth/logout/route")).POST;
    const logoutRes = await callApi(logoutPost, {
      method: "POST",
      cookies: cookieRecord(forcedJar),
    });
    expect(logoutRes.status).toBe(200);

    // 重新用临时密码登录，完成强制改密
    const { jar: forcedJar2 } = await login(email, approved.tempPassword);
    const passwordPut = (await import("@/app/api/user/password/route")).PUT;
    const changeRes = await callApi(passwordPut, {
      method: "PUT",
      cookies: cookieRecord(forcedJar2),
      body: { currentPassword: approved.tempPassword, newPassword: NEW_PASSWORD },
    });
    expect(changeRes.status).toBe(200);
    const changeBody = await getData<{ ok: boolean; mustChangePassword: boolean }>(changeRes);
    expect(changeBody.mustChangePassword).toBe(false);
    // 强制改密 cookie 必须在同一响应里被清掉，否则中间件会把用户钉回改密页
    const setCookies =
      changeRes.headers.getSetCookie?.() ??
      (changeRes.headers.get("set-cookie") ? [changeRes.headers.get("set-cookie")!] : []);
    expect(setCookies.some((c) => c.startsWith(`${PASSWORD_CHANGE_REQUIRED_COOKIE}=;`))).toBe(true);

    // 标记清除 + 临时密码失效 + 新密码可用
    const finalUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(finalUser.mustChangePassword).toBe(false);
    expect(finalUser.passwordChangedAt).not.toBeNull();

    // 本用例对同一邮箱登录多次（成功 + 故意失败），清掉单邮箱/单标识限流再验证收尾。
    // testClientKey()：B1 之后无信任 IP 时标识是请求头指纹（不再是常量 "unknown"）。
    // login-lock：同邮箱 5 次/15 分钟的账号锁也跨用例累积，一并清零。
    for (const ip of ["unknown", "127.0.0.1", testClientKey()]) {
      await resetRateLimit(`login:${ip}:${email}`);
    }
    await resetRateLimit(`login-lock:${email}`);
    expect((await login(email, approved.tempPassword)).response.status).toBe(401);
    await resetRateLimit(`login-lock:${email}`);
    expect((await login(email, NEW_PASSWORD)).response.status).toBe(200);
  });

  it("新密码不得与临时密码相同（防绕过强制改密）", async () => {
    const email = uniqueEmail();
    const user = await registerUser(email);
    await resetRateLimit(`forgot-email:${email}`);
    await submitRequest(email);
    const row = await latestRequest(user.id);
    const adminJar = await adminLogin();
    const approveRes = await handleRequest(adminJar, row.id, { action: "approve" });
    const approved = await getData<{ tempPassword: string }>(approveRes);

    const { jar } = await login(email, approved.tempPassword);
    const passwordPut = (await import("@/app/api/user/password/route")).PUT;
    const res = await callApi(passwordPut, {
      method: "PUT",
      cookies: cookieRecord(jar),
      body: { currentPassword: approved.tempPassword, newPassword: approved.tempPassword },
    });
    expect(res.status).toBe(400);
    // 仍处于强制改密状态
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.mustChangePassword).toBe(true);
  });

  it("驳回：状态置 REJECTED 并保留原因，账号密码不受影响", async () => {
    const email = uniqueEmail();
    const user = await registerUser(email);
    await resetRateLimit(`forgot-email:${email}`);
    await submitRequest(email);
    const row = await latestRequest(user.id);
    const adminJar = await adminLogin();

    const res = await handleRequest(adminJar, row.id, {
      action: "reject",
      note: "身份信息与订单不一致，请补充订单号",
    });
    expect(res.status).toBe(200);

    const after = await latestRequest(user.id);
    expect(after.status).toBe("REJECTED");
    expect(after.rejectReason).toContain("订单号");
    expect(after.handledAt).not.toBeNull();

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.mustChangePassword).toBe(false);
    // 原密码仍然有效
    expect((await login(email, USER_PASSWORD)).response.status).toBe(200);

    // 驳回后可重新提交新申请
    await resetRateLimit(`forgot-email:${email}`);
    await submitRequest(email);
    const again = await latestRequest(user.id);
    expect(again.status).toBe("PENDING");
    expect(again.id).not.toBe(row.id);
  });

  it("已处理过的申请不能重复处理（409）", async () => {
    const email = uniqueEmail();
    const user = await registerUser(email);
    await resetRateLimit(`forgot-email:${email}`);
    await submitRequest(email);
    const row = await latestRequest(user.id);
    const adminJar = await adminLogin();

    expect((await handleRequest(adminJar, row.id, { action: "reject" })).status).toBe(200);
    expect((await handleRequest(adminJar, row.id, { action: "approve" })).status).toBe(409);
  });

  it("管理员不能处理自己的找回申请（400）", async () => {
    // 直接造一条指向管理员本人的在途申请，模拟自批场景
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    const selfRow = await prisma.passwordResetRequest.create({
      data: { userId: admin.id, email: admin.email, status: "PENDING" },
    });
    try {
      const adminJar = await adminLogin();
      const res = await handleRequest(adminJar, selfRow.id, { action: "approve" });
      expect(res.status).toBe(400);
    } finally {
      await prisma.passwordResetRequest.delete({ where: { id: selfRow.id } });
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { callApi, getData, login, registerAndLogin } from "../helpers/api";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import sharp from "sharp";
import { validateImageBuffer } from "@/lib/storage";
import { isSafeLogoUrl } from "@/lib/logo-contrast";

/**
 * 账户注销申请闭环（Phase 12：大爷指正——申请必须与后台管理衔接，不能只躺在审计日志里）
 * 覆盖：用户提交/重复提交/自助撤回 → admin 驳回 / 确认注销（匿名化删除 + 会话即时吊销）
 */

function cookiesOf(jar: { get: (n: string) => string | undefined }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(n);
    if (v) out[n] = v;
  }
  return out;
}

const stamp = Date.now();
const userEmail = `del-test-${stamp}@example.com`;

let userId: string;
let userJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };
let adminJar: { get: (n: string) => string | undefined; absorb: (r: Response) => void };

afterAll(async () => {
  await prisma.notifyMe.deleteMany({
    where: { email: { in: [userEmail, `deleted-${userId}@invalid.local`] } },
  });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

beforeAll(async () => {
  const reg = await registerAndLogin(userEmail);
  userJar = reg.jar;
  // 注册接口返回 { data: { user: {... } } }，直接按邮箱查库拿 id（不依赖返回形状）
  const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
  userId = user.id;
  await prisma.address.create({
    data: {
      userId,
      recipientName: "Deletion Test",
      phone: "13800000000",
      province: "Test",
      city: "Test",
      district: "Test",
      detail: "Test address",
    },
  });
  await prisma.notification.create({
    data: {
      userId,
      type: "system",
      title: "Test notification",
      body: "Test body",
    },
  });
  await prisma.notifyMe.create({
    data: { email: userEmail, productId: null, status: "draft" },
  });
  const admin = await login("admin@example.com", "Admin@123456");
  adminJar = admin.jar;
});

describe("注销申请 — 用户端状态闭环", () => {
  it("数据导出覆盖个人数据且排除凭证字段", async () => {
    const { GET } = await import("@/app/api/user/export/route");
    const res = await callApi(GET, { cookies: cookiesOf(userJar) });
    expect(res.status).toBe(200);
    const body = (await getData(res)) as {
      addresses: Array<{ id: string }>;
      notifications: unknown[];
      excludedSecurityFields: string[];
    };
    expect(body.addresses.some((address) => address.id)).toBe(true);
    expect(body.notifications.length).toBeGreaterThan(0);
    expect(body.excludedSecurityFields).toContain("passwordHash");
    expect(body.excludedSecurityFields).toContain("refreshToken.tokenHash");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(userJar.get(REFRESH_TOKEN_COOKIE));
  });

  it("提交申请：状态落库 + me 可见", async () => {
    const { POST } = await import("@/app/api/user/deletion-request/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: { reason: "集成测试：不再需要本站服务" },
    });
    expect(res.status).toBe(200);
    const body = (await getData(res)) as { deletionRequestedAt: string };
    expect(new Date(body.deletionRequestedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletionRequestedAt).not.toBeNull();

    // me 接口返回申请状态（profile 页据此渲染状态卡）
    const { GET: meGet } = await import("@/app/api/auth/me/route");
    const me = await callApi(meGet, { cookies: cookiesOf(userJar) });
    expect(me.status).toBe(200);
    const meBody = (await getData(me)) as { user: { deletionRequestedAt: string | null } };
    expect(meBody.user.deletionRequestedAt).not.toBeNull();
  });

  it("在途申请重复提交 → 409", async () => {
    const { POST } = await import("@/app/api/user/deletion-request/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: { reason: "" },
    });
    expect(res.status).toBe(409);
  });

  it("自助撤回 → 状态清空", async () => {
    const { DELETE } = await import("@/app/api/user/deletion-request/route");
    const res = await callApi(DELETE, {
      method: "DELETE",
      cookies: cookiesOf(userJar),
    });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletionRequestedAt).toBeNull();
  });

  it("撤回后重复撤回 → 409（无在途申请）", async () => {
    const { DELETE } = await import("@/app/api/user/deletion-request/route");
    const res = await callApi(DELETE, { method: "DELETE", cookies: cookiesOf(userJar) });
    expect(res.status).toBe(409);
  });

  it("管理员站内通知：申请时即通知到后台（衔接打通的核心断言）", async () => {
    // 重新提交一份（下面给 admin 处理用）
    const { POST } = await import("@/app/api/user/deletion-request/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: { reason: "集成测试：请处理" },
    });
    expect(res.status).toBe(200);

    // notifyAdmins 落了站内通知（title 含「注销」）
    const notes = await prisma.notification.findMany({
      where: { title: { contains: "注销" }, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
      take: 5,
    });
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe("注销申请 — admin 处理闭环", () => {
  it("无在途申请的用户处理 → 400", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const { POST } = await import("@/app/api/admin/users/[id]/deletion/route");
    // admin 自己没有在途申请
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      params: { id: admin.id },
      body: { action: "reject" },
    });
    expect(res.status).toBe(400);
  });

  it("驳回：状态清空 + 用户可继续使用", async () => {
    const { POST } = await import("@/app/api/admin/users/[id]/deletion/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      params: { id: userId },
      body: { action: "reject", note: "集成测试驳回：账户有未完成订单" },
    });
    expect(res.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.deletionRequestedAt).toBeNull();
    expect(user.status).toBe("ACTIVE"); // 账户未做任何变更
    expect(user.email).toBe(userEmail); // 邮箱未动

    // 用户仍可正常访问 me（会话未吊销）
    const { GET: meGet } = await import("@/app/api/auth/me/route");
    const me = await callApi(meGet, { cookies: cookiesOf(userJar) });
    expect(me.status).toBe(200);
  });

  it("确认注销：匿名化 + 状态停用 + 会话即时吊销", async () => {
    // 用户再提交一份，走确认注销
    const { POST: reqPost } = await import("@/app/api/user/deletion-request/route");
    const req = await callApi(reqPost, {
      method: "POST",
      cookies: cookiesOf(userJar),
      body: { reason: "集成测试：请注销" },
    });
    expect(req.status).toBe(200);

    const { POST } = await import("@/app/api/admin/users/[id]/deletion/route");
    const res = await callApi(POST, {
      method: "POST",
      cookies: cookiesOf(adminJar),
      params: { id: userId },
      body: { action: "approve" },
    });
    expect(res.status).toBe(200);
    const body = (await getData(res)) as { action: string; anonymized: boolean };
    expect(body.anonymized).toBe(true);

    // 匿名化断言：个人信息清除 + 停用 + 财务外键保留
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(`deleted-${userId}@invalid.local`);
    expect(user.name).toBe("已注销用户");
    expect(user.status).toBe("DISABLED");
    expect(user.deletionRequestedAt).toBeNull();

    // 隐私范围：地址、站内消息清除；邮箱型订阅只匿名化当前用户的数据。
    expect(await prisma.address.count({ where: { userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId } })).toBe(0);
    const subscriptions = await prisma.notifyMe.findMany({ where: { email: userEmail } });
    expect(subscriptions).toHaveLength(0);
    expect(
      await prisma.notifyMe.count({ where: { email: `deleted-${userId}@invalid.local` } }),
    ).toBe(1);

    // 全端会话吊销：旧 access token 立即失效
    const { GET: meGet } = await import("@/app/api/auth/me/route");
    const me = await callApi(meGet, { cookies: cookiesOf(userJar) });
    expect(me.status).toBe(401);

    // 旧邮箱无法再登录
    const relogin = await login(userEmail, "User@123456");
    expect(relogin.response.status).toBe(401);
  });
});

describe("上传与远程 Logo 安全回归", () => {
  it("只接受 MIME 与真实图片 magic 一致的上传内容", async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    expect((await validateImageBuffer(png, "image/png")).ok).toBe(true);
    expect((await validateImageBuffer(Buffer.from("<script>"), "image/png")).ok).toBe(false);
    expect((await validateImageBuffer(png, "image/jpeg")).ok).toBe(false);
  });

  it("拒绝 loopback、私网和本地协议作为远程 Logo", async () => {
    expect(await isSafeLogoUrl("http://127.0.0.1/logo.png")).toBe(false);
    expect(await isSafeLogoUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(await isSafeLogoUrl("http://localhost/logo.png")).toBe(false);
    expect(await isSafeLogoUrl("file:///etc/passwd")).toBe(false);
  });
});

import { describe, expect, it, beforeAll } from "vitest";
import { callApi, getData, login, registerAndLogin, CookieJar } from "../helpers/api";
import { prisma } from "@/lib/prisma";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";

/** 认证与用户 API 集成测试（直接调用 Route Handler） */

const unique = () => `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

async function cleanup(email: string) {
  await prisma.user.deleteMany({ where: { email } });
}

describe("认证流程", () => {
  it("注册 → 登录 → me → 刷新 → 登出", async () => {
    const email = unique();

    // 注册
    const { POST: registerPost } = await import("@/app/api/auth/register/route");
    const reg = await callApi(registerPost, {
      method: "POST",
      body: { email, name: "集成测试", password: "User@123456" },
    });
    expect(reg.status).toBe(200);
    const regUser = (await getData(reg)) as { user: { email: string; role: string } };
    expect(regUser.user.email).toBe(email);
    expect(regUser.user.role).toBe("CUSTOMER");

    const jar = new CookieJar();
    jar.absorb(reg);
    expect(jar.get(ACCESS_TOKEN_COOKIE)).toBeTruthy();
    expect(jar.get(REFRESH_TOKEN_COOKIE)).toBeTruthy();

    // 弱密码注册被拒
    const weak = await callApi(registerPost, {
      method: "POST",
      body: { email: unique(), name: "弱密码", password: "abc" },
    });
    expect(weak.status).toBe(400);

    // 重复注册被拒
    const dup = await callApi(registerPost, {
      method: "POST",
      body: { email, name: "重复", password: "User@123456" },
    });
    expect(dup.status).toBe(409);

    // me
    const { GET: meGet } = await import("@/app/api/auth/me/route");
    const me = await callApi(meGet, { cookies: cookieRecord(jar) });
    expect(me.status).toBe(200);

    // 错误密码登录
    const wrong = await login(email, "Wrong@123456");
    expect(wrong.response.status).toBe(401);

    // 正确密码登录
    const ok = await login(email, "User@123456");
    expect(ok.response.status).toBe(200);

    // 刷新
    const { POST: refreshPost } = await import("@/app/api/auth/refresh/route");
    const refresh = await callApi(refreshPost, {
      method: "POST",
      cookies: cookieRecord(ok.jar),
    });
    expect(refresh.status).toBe(200);
    ok.jar.absorb(refresh);

    // 登出
    const { POST: logoutPost } = await import("@/app/api/auth/logout/route");
    const logout = await callApi(logoutPost, { method: "POST", cookies: cookieRecord(ok.jar) });
    expect(logout.status).toBe(200);
    ok.jar.absorb(logout);
    expect(ok.jar.get(ACCESS_TOKEN_COOKIE)).toBeUndefined();

    // 登出后 me 401
    const meAfter = await callApi(meGet, { cookies: cookieRecord(ok.jar) });
    expect(meAfter.status).toBe(401);

    await cleanup(email);
  });

  it("种子用户登录并访问资料", async () => {
    const { jar } = await login("user@example.com", "User@123456");
    const { GET: meGet } = await import("@/app/api/auth/me/route");
    const me = await callApi(meGet, { cookies: cookieRecord(jar) });
    expect(me.status).toBe(200);
    const data = (await getData(me)) as { user: { email: string } };
    expect(data.user.email).toBe("user@example.com");
  });
});

describe("密码重置", () => {
  it("忘记密码始终返回成功（防枚举）", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await callApi(POST, {
      method: "POST",
      body: { email: "not-exist@test.local" },
    });
    expect(res.status).toBe(200);
    const data = (await getData(res)) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("无效重置 token 被拒绝", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await callApi(POST, {
      method: "POST",
      body: { token: "invalid-token-value-123456", password: "NewPass@123" },
    });
    expect(res.status).toBe(400);
  });
});

describe("地址管理", () => {
  let jar: CookieJar;
  const email = unique();

  beforeAll(async () => {
    const r = await registerAndLogin(email);
    jar = r.jar;
  });

  it("新增/列表/更新/删除", async () => {
    const { GET, POST } = await import("@/app/api/user/addresses/route");
    const { PUT, DELETE } = await import("@/app/api/user/addresses/[id]/route");

    const create = await callApi(POST, {
      method: "POST",
      cookies: cookieRecord(jar),
      body: {
        recipientName: "测试收货人",
        phone: "13800138000",
        province: "广东省",
        city: "深圳市",
        district: "南山区",
        detail: "科技园路 1 号 101 室",
        isDefault: true,
      },
    });
    expect(create.status).toBe(200);
    const addr = (await getData(create)) as { address: { id: string; isDefault: boolean } };
    expect(addr.address.isDefault).toBe(true);

    const list = await callApi(GET, { cookies: cookieRecord(jar) });
    expect(list.status).toBe(200);
    const addrs = (await getData(list)) as { addresses: { id: string }[] };
    expect(addrs.addresses.length).toBeGreaterThanOrEqual(1);

    const update = await callApi(PUT, {
      method: "PUT",
      cookies: cookieRecord(jar),
      params: { id: addr.address.id },
      body: { detail: "科技园路 2 号 202 室" },
    });
    expect(update.status).toBe(200);

    const del = await callApi(DELETE, {
      method: "DELETE",
      cookies: cookieRecord(jar),
      params: { id: addr.address.id },
    });
    expect(del.status).toBe(200);
  });
});

function cookieRecord(jar: CookieJar): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    const v = jar.get(name);
    if (v) cookies[name] = v;
  }
  return cookies;
}

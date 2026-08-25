import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { signAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/constants";

/** 中间件测试：CSRF 防护与 /admin 路由守卫（Edge 兼容，Node 环境可直接执行） */

function makeReq(
  url: string,
  opts: { method?: string; cookie?: string; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers);
  if (opts.cookie) headers.set("cookie", opts.cookie);
  return new NextRequest(new URL(`http://localhost:3000${url}`), {
    method: opts.method ?? "GET",
    headers,
  });
}

describe("CSRF 防护", () => {
  it("变更请求缺少 CSRF 头 → 403", async () => {
    const res = await middleware(
      makeReq("/api/cart", {
        method: "POST",
        cookie: "csrf_token=abcdefabcdefabcdefabcdefabcdefabcdef",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("CSRF 头与 Cookie 不一致 → 403", async () => {
    const res = await middleware(
      makeReq("/api/cart", {
        method: "POST",
        cookie: "csrf_token=abcdefabcdefabcdefabcdefabcdefabcdef",
        headers: { "x-csrf-token": "different-value-1111111111111111" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("CSRF 头与 Cookie 一致 → 放行", async () => {
    const token = "abcdefabcdefabcdefabcdefabcdefabcdef";
    const res = await middleware(
      makeReq("/api/cart", {
        method: "POST",
        cookie: `csrf_token=${token}`,
        headers: { "x-csrf-token": token },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("Webhook 路由豁免 CSRF", async () => {
    const res = await middleware(makeReq("/api/webhooks/stripe", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("GET 请求下发 CSRF Cookie", async () => {
    const res = await middleware(makeReq("/api/products"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("csrf_token=");
  });
});

describe("/admin 路由守卫", () => {
  it("未登录访问 /admin → 重定向登录页", async () => {
    const res = await middleware(makeReq("/admin/products"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("CUSTOMER 角色访问 /admin → 重定向", async () => {
    const token = await signAccessToken({
      sub: "user-1",
      email: "user@example.com",
      name: "用户",
      role: "CUSTOMER",
    });
    const res = await middleware(makeReq("/admin", { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` }));
    expect(res.status).toBe(307);
  });

  it("ADMIN 角色访问 /admin → 放行", async () => {
    const token = await signAccessToken({
      sub: "admin-1",
      email: "admin@example.com",
      name: "管理员",
      role: "ADMIN",
    });
    const res = await middleware(makeReq("/admin", { cookie: `${ACCESS_TOKEN_COOKIE}=${token}` }));
    expect(res.status).toBe(200);
  });

  it("/admin/login 无需登录", async () => {
    const res = await middleware(makeReq("/admin/login"));
    expect(res.status).toBe(200);
  });
});

describe("请求 ID 注入", () => {
  it("响应头包含 x-request-id", async () => {
    const res = await middleware(makeReq("/api/products"));
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});

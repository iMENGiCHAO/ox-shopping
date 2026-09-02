import { NextRequest } from "next/server";

/**
 * 集成测试工具：直接调用 Next.js Route Handler（无需启动服务器）。
 * 认证通过 Cookie 传递；CSRF 由中间件负责（直调时不校验，中间件单独测试）。
 */

export interface RequestOptions {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}

export class CookieJar {
  private map = new Map<string, string>();

  /** 从响应 Set-Cookie 吸收 Cookie（自动去重更新） */
  absorb(response: Response): void {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    const raw = response.headers.get("set-cookie");
    const list = setCookies.length > 0 ? setCookies : raw ? [raw] : [];
    for (const item of list) {
      const [pair] = item.split(";");
      const idx = pair!.indexOf("=");
      const name = pair!.slice(0, idx);
      const value = pair!.slice(idx + 1);
      if (value === "") {
        this.map.delete(name);
      } else {
        this.map.set(name, value);
      }
    }
  }

  set(name: string, value: string): void {
    this.map.set(name, value);
  }

  get(name: string): string | undefined {
    return this.map.get(name);
  }

  header(): string {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

type Handler = (
  req: NextRequest,
  ctx: { params: Record<string, string | string[]> },
) => Promise<Response>;

export async function callApi(
  handler: Handler,
  opts: RequestOptions & { params?: Record<string, string> } = {},
): Promise<Response> {
  // 注入 next/headers cookies() mock（见 setup-env.ts）
  globalThis.__TEST_COOKIES__ = {
    get: (name: string) => {
      const value = opts.cookies?.[name];
      return value ? { name, value } : undefined;
    },
  };

  const url = new URL("http://test.local" + (opts.headers?.["x-test-url"] ?? "/"));
  const headers = new Headers(opts.headers);
  headers.set("x-forwarded-for", "127.0.0.1");
  if (opts.cookies && Object.keys(opts.cookies).length > 0) {
    headers.set(
      "cookie",
      Object.entries(opts.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    );
  }
  const req = new NextRequest(url, {
    method: opts.method ?? "GET",
    headers,
    body:
      opts.body !== undefined
        ? typeof opts.body === "string"
          ? opts.body
          : JSON.stringify(opts.body)
        : undefined,
  });
  return handler(req, {
    params: Object.fromEntries(Object.entries(opts.params ?? {}).map(([k, v]) => [k, [v]])),
  });
}

/** 解析 { data } 信封 */
export async function getData<T = Record<string, unknown>>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T; error?: unknown };
  if ("error" in body) throw new Error(`接口错误: ${JSON.stringify(body.error)}`);
  return body.data as T;
}

/** 用邮箱密码登录，返回 CookieJar */
export async function login(email: string, password: string, jar = new CookieJar()) {
  const { POST } = await import("@/app/api/auth/login/route");
  const res = await callApi(POST, {
    method: "POST",
    body: { email, password },
  });
  jar.absorb(res);
  return { response: res, jar };
}

/** 注册并登录，返回 jar 与用户 */
export async function registerAndLogin(email: string, password = "User@123456") {
  const { POST: registerPost } = await import("@/app/api/auth/register/route");
  const res = await callApi(registerPost, {
    method: "POST",
    body: { email, name: "集成测试用户", password },
  });
  const jar = new CookieJar();
  jar.absorb(res);
  return {
    jar,
    registerResponse: res,
    user: (await getData(res)) as { id: string; email: string },
  };
}

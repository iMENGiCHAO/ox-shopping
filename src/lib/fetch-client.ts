"use client";

/**
 * 客户端 fetch 封装：
 * - 自动携带 CSRF 头(double-submit cookie)
 * - 统一解析 { data } / { error } 信封
 * - 401 时可选跳转登录
 */
import { CSRF_HEADER, CSRF_COOKIE } from "@/lib/constants";
import { langFromCookies } from "@/lib/request-lang";
import { translate } from "@/lib/shop-i18n";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function getCsrfToken(): string {
  return readCookie(CSRF_COOKIE);
}

/** 确保 CSRF Cookie 存在(页面直接访问 /auth/login 等场景，首次变更请求前拉取) */
async function ensureCsrfCookie(): Promise<void> {
  if (getCsrfToken()) return;
  try {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
  } catch {
    /* 网络异常时由请求本身报错 */
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  opts: { redirectOn401?: boolean } = {},
): Promise<T> {
  return apiFetchRaw<{ data: T }>(path, init, opts).then((body) => body.data);
}

/**
 * 原始信封版本：返回 { data, pagination, ... } 完整响应体。
 * 用于列表接口(需要分页信息时)；apiFetch 只返回 data 字段。
 */
export async function apiFetchRaw<TBody = unknown>(
  path: string,
  init: RequestInit = {},
  opts: { redirectOn401?: boolean } = {},
): Promise<TBody> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();

  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    await ensureCsrfCookie();
    headers.set(CSRF_HEADER, getCsrfToken());
  }
  headers.set("Accept", "application/json");

  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    // 兜底文案按当前语言取字典（此前写死中文，英文站会漏出中文）
    const message =
      err?.message ??
      translate("Request failed ({status})", langFromCookies(readCookie), { status: res.status });
    if (res.status === 401 && opts.redirectOn401) {
      window.location.href = "/auth/login?next=" + encodeURIComponent(window.location.pathname);
    }
    throw new ApiClientError(res.status, err?.code ?? "UNKNOWN", message, err?.details);
  }

  return body as TBody;
}

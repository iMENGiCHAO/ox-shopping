"use client";

import { useEffect, useState, useCallback } from "react";
import { LOGGED_IN_COOKIE } from "@/lib/constants";

/** 是否已登录（读 JS 可读提示 cookie），未登录时跳过轮询，避免 /api/notifications 401 控制台噪音 */
function hasLoggedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${LOGGED_IN_COOKIE}=`));
}

/**
 * 全局通知轮询 hook — 数据打通：admin 发送通知后用户能实时感知。
 * 头部对齐 上游参考站 无 UserMenu，因此通过购物车图标红点提示未读通知。
 * 30 秒轮询一次 /api/notifications，仅登录用户有效。
 */
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);

  const fetchUnread = useCallback(async () => {
    // 未登录时直接跳过（无 logged_in cookie），不发 401 请求
    if (!hasLoggedInCookie()) {
      setUnreadCount(0);
      setHasUnread(false);
      return;
    }
    try {
      // 调用现有 /api/notifications，取 unreadCount 字段（limit 参数减少传输）
      const res = await fetch("/api/notifications?unreadOnly=true", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setUnreadCount(0);
          setHasUnread(false);
        }
        return;
      }
      const data = await res.json();
      const count = Number(data.unreadCount ?? 0);
      setUnreadCount(count);
      setHasUnread(count > 0);
    } catch {
      // 网络错误静默忽略，不影响购物车功能
    }
  }, []);

  useEffect(() => {
    // 立即检查一次
    void fetchUnread();
    // 30 秒轮询（与原 UserMenu 轮询间隔一致）
    const id = setInterval(() => void fetchUnread(), 30_000);
    // 监听页面可见性变化：从后台切回前台时立即刷新
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    // 监听登录/登出事件
    const onAuthChanged = () => void fetchUnread();
    window.addEventListener("auth:changed", onAuthChanged);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("auth:changed", onAuthChanged);
    };
  }, [fetchUnread]);

  /** 标记已读后手动刷新（用户点击通知入口时调用） */
  const refresh = useCallback(() => void fetchUnread(), [fetchUnread]);

  return { unreadCount, hasUnread, refresh };
}

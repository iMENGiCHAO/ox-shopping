"use client";

import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 侧栏折叠按钮（客户端组件）
 * 通过切换 document.body 的 admin-sidebar-collapsed class 来控制侧栏折叠
 * 状态持久化到 localStorage
 *
 * 2026-09-24：原侧栏底部的 AdminSidebarCollapseButton 已移除 ——
 * 折叠/展开统一由顶栏本按钮操作，收缩态侧栏不再放第二个按钮。
 */
export function AdminSidebarToggle({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(collapsed);

  // 挂载时从 localStorage 读取初始状态
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("admin-sidebar-collapsed") === "1";
      setIsCollapsed(stored);
      if (stored) {
        document.body.classList.add("admin-sidebar-collapsed");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0");
        if (next) {
          document.body.classList.add("admin-sidebar-collapsed");
        } else {
          document.body.classList.remove("admin-sidebar-collapsed");
        }
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isCollapsed ? "展开侧栏" : "收起侧栏"}
      title={isCollapsed ? "展开侧栏" : "收起侧栏"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      {isCollapsed ? (
        <PanelLeftOpen className="h-[16px] w-[16px]" strokeWidth={1.75} />
      ) : (
        <PanelLeftClose className="h-[16px] w-[16px]" strokeWidth={1.75} />
      )}
    </button>
  );
}

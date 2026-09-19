"use client";

import { LogOut } from "lucide-react";
import { apiFetch } from "@/lib/fetch-client";
import { toast } from "sonner";
import { useT } from "@/components/shop/lang-provider";

/** 个人中心右侧导航的退出登录按钮（原顶栏下拉菜单项迁移至此） */
export function AccountLogoutButton() {
  const t = useT();

  const onClick = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      window.dispatchEvent(new CustomEvent("auth:logout"));
      // 整页导航：登出后服务端渲染的 Header 需重新读取会话，
      // router.push() 在同一 layout 内不会重渲染 layout（顶栏会残留 Account）。
      window.location.href = "/";
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("Sign-out failed, please try again later"),
      );
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <LogOut className="h-4 w-4" />
      {t("Sign Out")}
    </button>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getT } from "@/lib/shop-i18n-server";
import { ChangeTempPasswordForm } from "@/components/shop/change-temp-password-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Set a new password to continue",
  robots: { index: false, follow: false },
};

/**
 * 强制改密页（B-2）—— `/auth/change-password`
 *
 * 路由归属 `(checkout)` 组而非 `(shop)`：强制改密期间不应出现页头/导航/购物袋，
 * 否则用户会试图继续购物却被中间件弹回；最小外壳也让「此时只能做一件事」
 * 在视觉上成立（与结账页同理，只保留语言/币种 Provider）。
 *
 * 三种入口状态：
 *   - 无会话 → 回登录页（登出/过期后残留标记的唯一出口）
 *   - 有会话但已无强制要求 → 渲染「无需改密」态而**不是**重定向：
 *     中间件仍会拦截其它页面，若此处再 302 就会与中间件形成重定向死循环
 *   - 有会话且 `mustChangePassword` → 渲染改密表单
 */
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");

  if (!user.mustChangePassword) {
    const t = await getT();
    return (
      <div className="flex justify-center px-4 py-12">
        <div
          data-testid="no-password-change-required"
          className="w-full max-w-md rounded-lg border bg-card p-6 text-center"
        >
          <h1 className="text-lg font-normal text-foreground">
            {t("No password change required")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Your password was already updated — you can continue shopping.")}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-foreground underline underline-offset-4"
          >
            {t("Continue shopping")}
          </Link>
        </div>
      </div>
    );
  }

  return <ChangeTempPasswordForm email={user.email} />;
}

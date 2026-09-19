import type { Metadata } from "next";
import { RecoverForm } from "@/components/shop/recover-form";
import { getT } from "@/lib/shop-i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // 与原站一致：找回密码页不应被搜索引擎收录
  return { title: t("Recover password"), robots: { index: false, follow: false } };
}

/**
 * 独立路由版找回密码页（`/auth/forgot-password`）。
 * 内容与登录页内的**页内切换**版本共用同一个 RecoverForm 组件，
 * 因此两处的文案与版式不会漂移。
 * 保留此路由是为了支持邮件链接、书签等直达场景。
 */
export default function ForgotPasswordPage() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <RecoverForm />
      </div>
    </div>
  );
}

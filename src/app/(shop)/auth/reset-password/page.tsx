import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/shop/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password",
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

/** 重置密码页(服务端包装：读取 token 传给客户端表单，避免客户端 useSearchParams) */
export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return <ResetPasswordForm token={token} />;
}

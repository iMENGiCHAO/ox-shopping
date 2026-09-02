import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/shop/verify-email-form";

export const metadata: Metadata = {
  title: "Email Verification",
  description: "Verify your registered email",
  robots: { index: false, follow: false },
};

interface VerifyEmailPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** 邮箱验证页(服务端包装：读取 token 传给客户端组件) */
export default async function VerifyEmailPage(props: VerifyEmailPageProps) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return <VerifyEmailForm token={token} />;
}

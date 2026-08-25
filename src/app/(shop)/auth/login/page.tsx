import type { Metadata } from "next";
import { LoginForm } from "@/components/shop/login-form";
import { getT } from "@/lib/shop-i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = getT();
  return {
    title: t("Login"),
    description: "Log in to your Ox Shopping account",
    robots: { index: false, follow: false },
  };
}

interface LoginPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

/** 登录页(服务端包装：读取 next 参数传给客户端表单) */
export default function LoginPage({ searchParams }: LoginPageProps) {
  const rawNext = typeof searchParams.next === "string" ? searchParams.next : "";
  // 仅允许站内相对路径(以单个 / 开头，且非 // 协议相对)
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  return <LoginForm next={next} />;
}

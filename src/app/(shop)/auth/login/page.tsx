import type { Metadata } from "next";
import { LoginForm } from "@/components/shop/login-form";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { brandFallback } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  // 描述按当前语言 + 站点品牌生成，不写死英文与品牌名
  const lang = await getLang();
  const settings = await getSiteSettings();
  const brand = pickLang(settings.siteName, lang).trim() || brandFallback;
  return {
    title: t("Login"),
    description: t("Sign in to your {brand} account", { brand }),
    robots: { index: false, follow: false },
  };
}

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** 登录页(服务端包装：读取 next 参数传给客户端表单) */
export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const rawNext = typeof searchParams.next === "string" ? searchParams.next : "";
  // 仅允许站内相对路径(以单个 / 开头，且非 // 协议相对)
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  return <LoginForm next={next} />;
}

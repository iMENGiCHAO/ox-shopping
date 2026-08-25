import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 个人中心首页：跳转到资料编辑 */
export default function AccountIndexPage() {
  redirect("/account/profile");
}

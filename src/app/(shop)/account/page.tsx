import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 个人中心首页：跳转到消息中心
 *  - 顶栏 Account 角标（未读数）点进来时直接看到消息
 *  - 与左侧导航第一项保持一致 */
export default function AccountIndexPage() {
  redirect("/account/notifications");
}

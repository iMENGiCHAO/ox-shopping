import { redirect } from "next/navigation";

/**
 * 修改密码已并入个人资料页（大爷需求：/account/profile 的「Change Password」卡片）。
 * 旧路由重定向保持旧链接/收藏可用。
 */
export default function PasswordPage() {
  redirect("/account/profile#change-password");
}

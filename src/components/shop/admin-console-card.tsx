import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { getT } from "@/lib/shop-i18n-server";

/**
 * 员工账号在前端账号页的「进入管理后台」入口（大爷 2026-09-20 要求）。
 *
 * 需求原话：「管理员登录入口也可以前端进入，要是管理员账号在前端登录，
 * 就会在管理员的前端账号里面有个进入管理后台入口，点击弹出管理后台管理页面」。
 *
 * 设计取舍：
 *   · **只对 ADMIN / SUPPORT 渲染** —— 顾客账号看不到、也拿不到链接；
 *   · **新标签页打开 `/admin`**（"弹出"），前端购物与后台运营互不打断；
 *   · 真正的权限不靠这个入口遮挡：`/admin` 与 `/api/admin/**` 由 `proxy.ts` +
 *     `requireAdmin/requireStaff` 在服务端强制校验（前端隐藏从来不算安全边界）。
 */
export async function AdminConsoleCard({ role }: { role: "ADMIN" | "SUPPORT" | "CUSTOMER" }) {
  if (role === "CUSTOMER") return null;
  const t = await getT();

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-4 border border-border bg-gradient-to-br from-secondary/60 via-card to-card p-5 shadow-card">
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[15px] font-semibold tracking-tight">{t("Enter admin console")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("You are signed in with a staff account.")}
          </p>
        </div>
      </div>
      <a
        href="/admin"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t("Open admin console")}
        <ArrowUpRight className="ml-1.5 h-4 w-4" />
      </a>
    </div>
  );
}

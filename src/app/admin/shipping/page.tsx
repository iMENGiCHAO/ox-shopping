import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ShippingMethodsManager } from "@/components/admin/shipping-methods-manager";
import { listAllShippingMethods } from "@/server/services/shipping.service";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** 后台：物流方式管理（前台结账页的配送模板） */
export default async function AdminShippingPage() {
  // 安全审计 D3：adminOnly 只是客户端菜单过滤，不是授权边界 ——
  // 页面必须自己再挡一次，否则 SUPPORT 直连 URL 即可读到敏感运维配置
  await requireAdmin();
  const methods = await listAllShippingMethods();
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="物流方式"
        description="维护前台结账页展示的物流模板：运费、免邮门槛、货到付款与展示顺序。支持从快速模板一键创建，保存后立即生效。"
      />
      {/* baseCurrency：快速模板里的金额提示按门店基础币种渲染，不写死货币符号 */}
      <ShippingMethodsManager initial={methods} baseCurrency={env.CURRENCY} />
    </div>
  );
}

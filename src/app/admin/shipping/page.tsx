import { listAllShippingMethods } from "@/server/services/shipping.service";
import { ShippingMethodsManager } from "@/components/admin/shipping-methods-manager";

export const dynamic = "force-dynamic";

/** 后台：物流方式管理 */
export default async function AdminShippingPage() {
  const methods = await listAllShippingMethods();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">物流方式</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          维护前台结账可选的物流方式。运费 / 免邮门槛 / 货到付款 / 排序均在此编辑。
        </p>
      </div>
      <ShippingMethodsManager initial={methods} />
    </div>
  );
}

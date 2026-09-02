import { NextRequest, NextResponse } from "next/server";
import { apiHandler, json } from "@/lib/api";
import { listActiveShippingMethods } from "@/server/services/shipping.service";

/**
 * GET /api/shipping-methods
 * 公开 API — 列出当前激活的物流方式（前台 checkout / 购物车估算用）
 * 不需要登录（匿名访客也能看到），但只返回 isActive=true 的项
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const methods = await listActiveShippingMethods();
  return json({ methods });
});

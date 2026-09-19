import "server-only";
import { prisma } from "@/lib/prisma";
import type { ShippingMethod } from "@prisma/client";

/**
 * 物流方式服务：后台可编辑，前台 checkout 选项，订单关联。
 *
 * 设计：
 *   - 所有可用方式从 DB 拉（isActive=true，按 sortOrder 排序）
 *   - 满 freeOver 免邮（0 = 不免）
 *   - 货到付款（isCashOnDelivery）运费不计入订单 total，但记录为到付参考金额
 *   - 找不到 code 时用 "standard" 兜底
 */

export interface ShippingOption {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  fee: number;
  freeOver: number;
  isCashOnDelivery: boolean;
  etaZh: string | null;
  etaEn: string | null;
  sortOrder: number;
  isActive: boolean;
  /** 已被多少订单引用（仅后台列表返回；决定能否物理删除） */
  orderCount?: number;
}

/** 取所有启用的物流方式（前台 checkout 选项） */
export async function listActiveShippingMethods(): Promise<ShippingOption[]> {
  const rows = await prisma.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.map(serializeShippingMethod);
}

/** 后台：取所有方式（含禁用，附订单引用数） */
export async function listAllShippingMethods(): Promise<ShippingOption[]> {
  const rows = await prisma.shippingMethod.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { orders: true } } },
  });
  return rows.map((m) => ({
    ...serializeShippingMethod(m),
    orderCount: m._count.orders,
  }));
}

/** 按 code 查方式；找不到时兜底到 "standard" */
export async function findShippingMethodByCode(
  code: string,
): Promise<ShippingMethod | ShippingOption> {
  const row = await prisma.shippingMethod.findUnique({ where: { code } });
  if (row && row.isActive) return row;
  const fallback = await prisma.shippingMethod.findUnique({ where: { code: "standard" } });
  if (fallback) return fallback;
  throw new Error("未配置任何可用物流方式（请在后台「设置 → 物流方式」中创建）");
}

/** 订单关联：按 id 查 */
export async function findShippingMethodById(id: string): Promise<ShippingOption | null> {
  const row = await prisma.shippingMethod.findUnique({ where: { id } });
  return row ? serializeShippingMethod(row) : null;
}

/** 计算实际运费（考虑免邮门槛 + 货到付款） */
export interface ShippingCalcResult {
  fee: number;
  freeOver: number;
  isCashOnDelivery: boolean;
  method: ShippingOption;
}

export async function calculateShippingFee(
  methodCode: string,
  subtotal: number,
): Promise<ShippingCalcResult> {
  const method = (await findShippingMethodByCode(methodCode)) as ShippingOption;
  // 货到付款不计入订单 total
  if (method.isCashOnDelivery) {
    return {
      fee: 0, // 不计入 total
      freeOver: method.freeOver,
      isCashOnDelivery: true,
      method,
    };
  }
  // 满 freeOver 免邮
  if (method.freeOver > 0 && subtotal >= method.freeOver) {
    return {
      fee: 0,
      freeOver: method.freeOver,
      isCashOnDelivery: false,
      method,
    };
  }
  return {
    fee: Number(method.fee),
    freeOver: method.freeOver,
    isCashOnDelivery: false,
    method,
  };
}

function serializeShippingMethod(m: ShippingMethod): ShippingOption {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    nameEn: m.nameEn,
    description: m.description,
    descriptionEn: m.descriptionEn,
    fee: Number(m.fee),
    freeOver: Number(m.freeOver),
    isCashOnDelivery: m.isCashOnDelivery,
    etaZh: m.etaZh,
    etaEn: m.etaEn,
    sortOrder: m.sortOrder,
    isActive: m.isActive,
  };
}

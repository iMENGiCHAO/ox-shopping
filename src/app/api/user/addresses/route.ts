import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { addressSchema } from "@/lib/validations/address";

export const runtime = "nodejs";

/** GET /api/user/addresses — 当前用户地址列表(默认优先) */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return json({ addresses });
});

/** POST /api/user/addresses */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, addressSchema);

  const count = await prisma.address.count({ where: { userId: user.id } });
  const isDefault = input.isDefault || count === 0;
  if (isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.address.create({
    data: { ...input, userId: user.id, isDefault },
  });
  await audit({
    userId: user.id,
    action: "ADDRESS_CREATE",
    entity: "Address",
    entityId: address.id,
    req,
  });
  return json({ address });
});

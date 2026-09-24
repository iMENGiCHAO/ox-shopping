import { Prisma } from "@prisma/client";
import { apiHandler, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { addressSchema } from "@/lib/validations/address";

export const runtime = "nodejs";

function isRetryableAddressWrite(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

/** GET /api/user/addresses — 当前用户地址列表(默认优先) */
export const GET = apiHandler(async () => {
  const user = await requireUser();
  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return json({ addresses });
});

/** POST /api/user/addresses — 创建地址与默认项切换必须在同一事务内完成。 */
export const POST = apiHandler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, addressSchema);

  let address: Awaited<ReturnType<typeof prisma.address.create>> | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      address = await prisma.$transaction(
        async (tx) => {
          const count = await tx.address.count({ where: { userId: user.id } });
          const isDefault = input.isDefault || count === 0;
          if (isDefault) {
            await tx.address.updateMany({
              where: { userId: user.id, isDefault: true },
              data: { isDefault: false },
            });
          }
          return tx.address.create({ data: { ...input, userId: user.id, isDefault } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (!isRetryableAddressWrite(error) || attempt === 2) throw error;
    }
  }
  if (!address) throw new Error("Address transaction did not produce a result");

  await audit({
    userId: user.id,
    action: "ADDRESS_CREATE",
    entity: "Address",
    entityId: address.id,
    req,
  });
  return json({ address });
});

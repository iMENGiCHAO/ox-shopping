import { Prisma } from "@prisma/client";
import { apiHandler, json, readJson } from "@/lib/api";
import { badRequest, rateLimited } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS } from "@/lib/rate-limits";
import { rateLimit } from "@/lib/rate-limit";
import { addressContentHash } from "@/lib/server/address-hash";
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
  // 边界审计：地址簿此前无限流、无上限——脚本可无限灌。10 次/分钟足够正常使用
  const rl = await rateLimit({ key: `addr-mut:${user.id}`, ...RATE_LIMITS.addressMutation });
  if (!rl.ok) throw rateLimited("Too many address changes, please try again later");
  const input = await readJson(req, addressSchema);
  // 地址簿上限：超过不再新建（可先删后加）
  const existingCount = await prisma.address.count({ where: { userId: user.id } });
  if (existingCount >= 20) {
    throw badRequest("Address book is full (max 20). Remove one before adding a new address.");
  }

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
          return tx.address.create({
            data: {
              ...input,
              userId: user.id,
              isDefault,
              // 内容指纹：同 userId 同内容 → P2002（下方转 400 诚实提示）
              contentHash: addressContentHash(input),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      // P2002 = 内容指纹撞唯一约束（双击保存/重复内容）——400 而非 500
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw badRequest("This address already exists in your address book.");
      }
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

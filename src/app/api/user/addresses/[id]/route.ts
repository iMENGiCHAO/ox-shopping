import { Prisma } from "@prisma/client";
import { apiHandler, json, readJson } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { addressUpdateSchema } from "@/lib/validations/address";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

function isRetryableAddressWrite(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

/** PUT /api/user/addresses/[id] — 切换默认地址与更新内容原子提交。 */
export const PUT = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);
  const input = await readJson(req, addressUpdateSchema);

  let address: Awaited<ReturnType<typeof prisma.address.update>> | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      address = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.address.findFirst({ where: { id, userId: user.id } });
          if (!existing) throw notFound("Address not found");
          if (input.isDefault) {
            await tx.address.updateMany({
              where: { userId: user.id, id: { not: id }, isDefault: true },
              data: { isDefault: false },
            });
          }
          return tx.address.update({ where: { id }, data: input });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw notFound("Address not found");
      }
      if (!isRetryableAddressWrite(error) || attempt === 2) throw error;
    }
  }
  if (!address) throw new Error("Address transaction did not produce a result");

  await audit({
    userId: user.id,
    action: "ADDRESS_UPDATE",
    entity: "Address",
    entityId: id,
    req,
  });
  return json({ address });
});

/** DELETE /api/user/addresses/[id] — 删除默认项时在同一事务内提升另一地址。 */
export const DELETE = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const existing = await tx.address.findFirst({ where: { id, userId: user.id } });
          if (!existing) throw notFound("Address not found");
          await tx.address.delete({ where: { id } });
          if (existing.isDefault) {
            const replacement = await tx.address.findFirst({
              where: { userId: user.id },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
            });
            if (replacement) {
              await tx.address.update({ where: { id: replacement.id }, data: { isDefault: true } });
            }
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw notFound("Address not found");
      }
      if (!isRetryableAddressWrite(error) || attempt === 2) throw error;
    }
  }

  await audit({
    userId: user.id,
    action: "ADDRESS_DELETE",
    entity: "Address",
    entityId: id,
    req,
  });
  return json({ ok: true });
});

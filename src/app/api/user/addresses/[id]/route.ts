import { apiHandler, json, readJson } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { addressUpdateSchema } from "@/lib/validations/address";
import { routeParam } from "@/app/api/_lib/params";

export const runtime = "nodejs";

/** PUT /api/user/addresses/[id] */
export const PUT = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
  if (!existing) throw notFound("Address not found");

  const input = await readJson(req, addressUpdateSchema);
  if (input.isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
  }

  const address = await prisma.address.update({ where: { id }, data: input });
  await audit({
    userId: user.id,
    action: "ADDRESS_UPDATE",
    entity: "Address",
    entityId: id,
    req,
  });
  return json({ address });
});

/** DELETE /api/user/addresses/[id] */
export const DELETE = apiHandler(async (req, ctx) => {
  const user = await requireUser();
  const id = routeParam(ctx.params.id);

  const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
  if (!existing) throw notFound("Address not found");

  await prisma.address.delete({ where: { id } });
  await audit({
    userId: user.id,
    action: "ADDRESS_DELETE",
    entity: "Address",
    entityId: id,
    req,
  });
  return json({ ok: true });
});

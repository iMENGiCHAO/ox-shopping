import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMail }));
vi.mock("@/server/services/notification.service", () => ({ notifyAdmins: vi.fn() }));

import { GET as previewGuestCart } from "@/app/api/cart/preview/route";
import { prisma } from "@/lib/prisma";
import { notifyRestock } from "@/server/services/notify-me.service";
import { callApi, getData } from "../helpers/api";

/**
 * Independent commercial delivery gate. It intentionally does not edit or
 * replace the domain-owner tests: this suite locks cross-domain outcomes that
 * must remain true when guest checkout and notification implementations change.
 */
const SUITE = `commercial-hardening-${Date.now()}`;
const RESTOCK_EMAILS = Array.from({ length: 201 }, (_, index) => `${SUITE}-${index}@test.local`);

describe("commercial hardening cross-domain regressions", () => {
  let categoryId = "";
  let productId = "";
  let soldOutPreorderId = "";

  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { name: `Commercial hardening ${SUITE}`, slug: `${SUITE}-category` },
    });
    categoryId = category.id;

    const preorder = await prisma.product.create({
      data: {
        name: "Guest preorder",
        slug: `${SUITE}-preorder`,
        sku: `${SUITE}-preorder-sku`,
        description: "Independent guest preorder regression",
        price: 88,
        stock: 0,
        status: "ACTIVE",
        isPresale: true,
        categoryId,
        images: [],
      },
    });
    soldOutPreorderId = preorder.id;

    const restockProduct = await prisma.product.create({
      data: {
        name: "Restock fanout product",
        slug: `${SUITE}-restock`,
        sku: `${SUITE}-restock-sku`,
        description: "Independent restock fanout regression",
        price: 55,
        stock: 1,
        status: "ACTIVE",
        categoryId,
        images: [],
      },
    });
    productId = restockProduct.id;
    await prisma.notifyMe.createMany({
      data: RESTOCK_EMAILS.map((email) => ({
        email,
        productId,
        status: "draft",
        lang: "en",
      })),
    });
  });

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({ delivered: true });
  });

  afterAll(async () => {
    await prisma.notifyMe.deleteMany({ where: { email: { startsWith: SUITE } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: SUITE } } });
    await prisma.category.deleteMany({ where: { slug: `${SUITE}-category` } });
  });

  it("keeps a sold-out guest preorder visible and purchasable in cart preview", async () => {
    const response = await callApi(previewGuestCart, {
      headers: { "x-test-url": `/api/cart/preview?ids=${soldOutPreorderId}` },
    });
    const payload = await getData<{
      products: Array<{ id: string; stock: number; isPresale: boolean }>;
    }>(response);

    expect(payload.products).toEqual([
      expect.objectContaining({ id: soldOutPreorderId, stock: 0, isPresale: true }),
    ]);
  });

  it("paginates beyond the 200-row batch limit without dropping the overflow", async () => {
    expect(await notifyRestock(productId)).toBe(201);
    expect(sendMail).toHaveBeenCalledTimes(201);

    const states = await prisma.notifyMe.groupBy({
      by: ["status"],
      where: { email: { startsWith: SUITE } },
      _count: { _all: true },
    });
    expect(states).toEqual([{ status: "notified", _count: { _all: 201 } }]);
  });

  it("does not mark a subscription notified when its email send fails", async () => {
    await prisma.notifyMe.updateMany({
      where: { email: { startsWith: `${SUITE}-` } },
      data: { status: "draft", notifiedAt: null },
    });
    sendMail.mockResolvedValueOnce({ delivered: false });

    expect(await notifyRestock(productId)).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(201);

    const failed = await prisma.notifyMe.findFirstOrThrow({
      where: { email: { startsWith: SUITE }, status: "draft" },
    });
    expect(failed.status).toBe("draft");
    expect(failed.notifiedAt).toBeNull();
    expect(
      await prisma.notifyMe.count({
        where: { email: { startsWith: SUITE }, status: "notified" },
      }),
    ).toBe(200);
  });
});

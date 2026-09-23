import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { assertSafeTestDatabaseUrl, shouldInitializeDatabase } from "../helpers/global-setup";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany },
  },
}));
vi.mock("@/lib/api", () => ({
  apiHandler: (handler: unknown) => handler,
  json: (data: unknown) => Response.json({ data }),
  searchParam: (params: URLSearchParams, key: string) => params.get(key),
}));

import { GET as previewGuestCart } from "@/app/api/cart/preview/route";

describe("commercial hardening · test database entry gate", () => {
  it.each([
    "postgresql://postgres@localhost:5432/ecommerce_test?schema=public",
    "postgres://postgres@db.internal:5432/ox_test?schema=public&sslmode=require",
  ])("accepts an unambiguous PostgreSQL *_test URL: %s", (url) => {
    expect(assertSafeTestDatabaseUrl(url)).toBe(url);
  });

  it.each([
    undefined,
    "",
    "postgresql://postgres@localhost:5432/ecommerce",
    "postgresql://postgres@localhost:5432/ecommerce_test_backup",
    "postgresql://postgres@localhost:5432/production_test/orders",
    "mysql://root@localhost:3306/ecommerce_test",
    "not-a-url",
    "postgresql://postgres@localhost:5432/ecommerce_test%2Farchive",
    " postgresql://postgres@localhost:5432/ecommerce_test",
  ])("fails closed for a missing or non-test database URL", (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/global-setup|refusing/i);
  });

  it("never attaches DB setup for a unit-only CLI selection", () => {
    expect(shouldInitializeDatabase(["node", "vitest.mjs", "run", "tests/unit"])).toBe(false);
    expect(
      shouldInitializeDatabase([
        "node",
        "vitest.mjs",
        "run",
        "tests/unit/commercial-hardening.test.ts",
      ]),
    ).toBe(false);
  });

  it("keeps DB setup enabled for integration and unqualified selections", () => {
    expect(shouldInitializeDatabase(["node", "vitest.mjs", "run", "tests/integration"])).toBe(true);
    expect(shouldInitializeDatabase(["node", "vitest.mjs", "run"])).toBe(true);
  });
});

describe("commercial hardening · guest cart presale preview", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("requests only active products and preserves the presale flag for a sold-out preorder", async () => {
    findMany.mockResolvedValue([
      {
        id: "preorder-1",
        name: "Preorder product",
        slug: "preorder-product",
        images: [],
        price: "42.00",
        stock: 0,
        status: "ACTIVE",
        isPresale: true,
      },
    ]);

    const response = await previewGuestCart(
      new NextRequest("http://test.local/api/cart/preview?ids=preorder-1"),
      { params: {} },
    );
    const payload = (await response.json()) as {
      data: { products: Array<{ id: string; stock: number; isPresale: boolean }> };
    };

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["preorder-1"] }, status: "ACTIVE" },
        select: expect.objectContaining({ isPresale: true }),
      }),
    );
    expect(payload.data.products).toEqual([
      expect.objectContaining({ id: "preorder-1", stock: 0, isPresale: true }),
    ]);
  });
});

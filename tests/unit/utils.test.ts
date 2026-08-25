import { describe, expect, it } from "vitest";
import {
  formatMoney,
  toCents,
  fromCents,
  generateOrderNumber,
  parsePagination,
  randomFilename,
  sha256,
  cn,
} from "@/lib/utils";

describe("formatMoney", () => {
  it("人民币格式", () => {
    expect(formatMoney(1299, "CNY")).toBe("¥1,299.00");
    expect(formatMoney("59.9", "CNY")).toBe("¥59.90");
  });

  it("美元格式", () => {
    expect(formatMoney(99.5, "USD")).toBe("$99.50");
  });

  it("空值返回占位符", () => {
    expect(formatMoney(null)).toBe("-");
    expect(formatMoney(undefined)).toBe("-");
    expect(formatMoney(Number.NaN)).toBe("-");
  });
});

describe("toCents / fromCents", () => {
  it("元转分（规避浮点误差）", () => {
    expect(toCents(0.1)).toBe(10);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents("1299")).toBe(129900);
    expect(toCents(0.29)).toBe(29);
  });

  it("分转元", () => {
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(100)).toBe(1);
  });
});

describe("generateOrderNumber", () => {
  it("格式 ORD + 日期 + 6 位数字", () => {
    expect(generateOrderNumber()).toMatch(/^ORD\d{8}\d{6}$/);
  });

  it("多次生成不重复（抽样）", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateOrderNumber()));
    expect(seen.size).toBe(200);
  });
});

describe("parsePagination", () => {
  it("默认值", () => {
    const p = parsePagination(new URLSearchParams());
    expect(p).toEqual({ page: 1, pageSize: 12, skip: 0, take: 12 });
  });

  it("正常解析", () => {
    const p = parsePagination(new URLSearchParams("page=3&pageSize=20"));
    expect(p).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 });
  });

  it("非法值回退默认", () => {
    const p = parsePagination(new URLSearchParams("page=abc&pageSize=-5"));
    expect(p).toEqual({ page: 1, pageSize: 12, skip: 0, take: 12 });
  });

  it("pageSize 封顶 100", () => {
    const p = parsePagination(new URLSearchParams("pageSize=999"));
    expect(p.pageSize).toBe(100);
  });
});

describe("randomFilename", () => {
  it("保留合法图片扩展名", () => {
    const name = randomFilename("photo.JPG");
    expect(name).toMatch(/^[a-f0-9]{32}\.jpg$/);
  });

  it("无扩展名默认 jpg", () => {
    expect(randomFilename("weird")).toMatch(/\.jpg$/);
  });

  it("非法扩展名忽略", () => {
    expect(randomFilename("evil.exe")).toMatch(/\.jpg$/);
  });
});

describe("sha256", () => {
  it("确定性摘要", async () => {
    expect(await sha256("abc")).toBe(await sha256("abc"));
    expect(await sha256("abc")).toHaveLength(64);
    expect(await sha256("abc")).not.toBe(await sha256("abd"));
  });
});

describe("cn", () => {
  it("合并类名并去重", () => {
    expect(cn("px-2", "py-1", false && "hidden", undefined)).toBe("px-2 py-1");
    expect(cn("p-1", "p-2")).toBe("p-2");
  });
});

import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("CSV 导出：公式注入防护", () => {
  it("以 = + - @ 开头的单元格被转义为文本", () => {
    const csv = toCsv([{ field: "=1+1" }, { field: "+cmd" }, { field: "-x" }, { field: "@x" }]);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[1]).toContain("'=1+1");
    expect(lines[2]).toContain("'+cmd");
    expect(lines[3]).toContain("'-x");
    expect(lines[4]).toContain("'@x");
  });

  it("普通值保持不变，含逗号/引号的值正确引用", () => {
    const csv = toCsv([{ name: "普通值", note: '含"引号",与逗号' }]);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[1]).toContain("普通值");
    expect(lines[1]).toContain('"含""引号"",与逗号"');
  });

  it("输出带 UTF-8 BOM（Excel 中文兼容）", () => {
    expect(toCsv([{ a: 1 }]).charCodeAt(0)).toBe(0xfeff);
  });
});

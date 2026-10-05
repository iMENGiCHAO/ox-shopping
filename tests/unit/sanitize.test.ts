import { describe, expect, it } from "vitest";
import { sanitizeHtml, sanitizePlainText } from "@/lib/sanitize";

/**
 * XSS 白名单回归（交付审计：sanitize 是富文本入库前的唯一净化层，此前零测试）。
 * 白名单见 src/lib/sanitize.ts：允许 p/br/strong/em/u/ul/ol/li/h3/h4/blockquote/code/a/img。
 */

describe("sanitizeHtml：XSS 白名单", () => {
  it("剥离 script / iframe / 事件属性，保留白名单标签", async () => {
    const out = await sanitizeHtml(
      '<p onclick="alert(1)">hi</p><script>alert(1)</script><iframe src="//evil"></iframe>',
    );
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/iframe/i);
    expect(out).not.toMatch(/onclick/i);
    expect(out).toContain("hi");
  });

  it("剥离 javascript: 协议链接", async () => {
    const out = await sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("保留白名单标签与安全属性（外链带 rel 不受影响）", async () => {
    const out = await sanitizeHtml(
      '<p>a</p><strong>b</strong><a href="https://example.com" title="t" rel="noopener">c</a><img src="/a.png" alt="i" width="10">',
    );
    expect(out).toContain("<strong>");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain("<img");
    expect(out).toContain('alt="i"');
  });

  it("剥离 svg onload 与 data: 协议载荷", async () => {
    const out = await sanitizeHtml('<svg onload="alert(1)"></svg><img src="data:text/html,<script>1</script>">');
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/<script/i);
  });

  it("白名单外标签被剥离但文本保留", async () => {
    const out = await sanitizeHtml("<b>bold</b><marquee>m</marquee>");
    expect(out).not.toMatch(/<b>|<marquee>/i);
    expect(out).toContain("bold");
  });
});

describe("sanitizePlainText：纯文本净化", () => {
  it("去除全部标签只留文本；script 的内容一并移除（更安全的默认）", async () => {
    const out = await sanitizePlainText("<b>a</b><script>x</script>");
    expect(out).toBe("a");
    expect(out).not.toContain("x");
  });

  it("保留中文与普通标点", async () => {
    const out = await sanitizePlainText("<p>你好，世界！</p>");
    expect(out).toBe("你好，世界！");
  });
});

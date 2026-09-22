import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * i18n **反向**守卫：用户可见文案必须是 `t("…")`，不许硬编码英文。
 *
 * 为什么需要它（大爷 2026-09-20 实测发现）：
 *   既有守卫 `i18n-keys.test.ts` 只检查「`t()` 里的键在词典里存在」——
 *   它**看不见**那些压根没用 `t()` 的文案。于是 `/account/profile` 的
 *   「修改登录邮箱」卡片出现了中英混排：标题走词典（中文），
 *   而 `Current sign-in email` / `New email` / `Confirm changes` 是硬编码英文。
 *   大爷的原话是「中英混着用，把这 bug 改好，不允许有这样的情况发生」。
 *
 * 检查范围：**账户区 + 分销中心**（面向顾客/分销商的中英双语界面）。
 *   商城其它页面（PLP/PDP/结账）沿用原站英文文案，属于另一套改造范围，
 *   不在本守卫里强制 —— 免得一次性红灯几十条、最后被无视。
 *
 * 判定口径：
 *   1. 同一行内 `>文字<` 的 JSX 文本节点；
 *   2. 独占一行的 JSX 文本（不含 `{`、`"`、`=` 等表达式特征）；
 *   3. 用户可见属性字面量：placeholder / aria-label / title / alt / label。
 *   过滤掉：邮箱、URL/路径、单个单词（品牌名）、词典键（`t("…")` 内）、注释。
 */
const ROOT = process.cwd();

/** 强制「零硬编码可见文案」的目录/文件 */
const ENFORCED = [
  "src/app/(shop)/account",
  "src/app/(distribution)",
  "src/components/shop/distribution",
  "src/components/shop/admin-console-card.tsx",
];

/** 允许出现的字面量（品牌/技术标识等，非可翻译文案） */
const ALLOWLIST = new Set(["Ox Shopping", "E-mail", "USD", "JSON", "SKU", "FAQ", "FAQs"]);

function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < n) {
        const s = src[i]!;
        if (s === "\\") {
          out += s + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += s;
        i++;
        if (s === c) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function walk(target: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, target);
  if (!fs.existsSync(abs)) return out;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (/\.(tsx|jsx)$/.test(abs)) out.push(abs);
    return out;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, entry.name);
    if (entry.isDirectory()) walk(path.relative(ROOT, p), out);
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** 是否是「像一句话」的可翻译文案：≥2 个含字母的词，且不含邮箱/路径/代码特征 */
function looksTranslatable(text: string): boolean {
  const s = text.trim();
  if (s.length < 6) return false;
  if (ALLOWLIST.has(s)) return false;
  if (s.includes("@") || s.includes("/") || s.includes("\\")) return false;
  if (/^[\d\s.,%¥$]+$/.test(s)) return false;
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
  return words.length >= 2;
}

interface Gap {
  file: string;
  line: number;
  text: string;
  kind: string;
}

function scanFile(abs: string): Gap[] {
  const rel = path.relative(ROOT, abs);
  const raw = fs.readFileSync(abs, "utf8");
  const src = stripComments(raw);
  const gaps: Gap[] = [];

  src.split("\n").forEach((line, idx) => {
    const lineNo = idx + 1;
    // 1) 同一行 JSX 文本节点： >文字<
    for (const m of line.matchAll(/>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g)) {
      const text = m[1] ?? "";
      if (looksTranslatable(text)) {
        gaps.push({ file: rel, line: lineNo, text: text.trim(), kind: "JSX 文本" });
      }
    }
    // 2) 独占一行的 JSX 文本。
    //    排除面要广：对象字面量（`id: x,`）、泛型（`Record<string,...>`）、表达式行……
    //    误报一旦多，守卫就会被无视。只认「首字母大写 + 多个词 + 不含代码标点 + 像句子」的行。
    const trimmed = line.trim();
    const codeLike = /[{}"'=;()\[\]<>:,]|[A-Za-z_$]+\s*:\s*|^\/\//;
    const sentenceLike = /[.!?…]$/.test(trimmed) || /^[A-Z][a-z]/.test(trimmed);
    if (
      trimmed &&
      /^[A-Z]/.test(trimmed) &&
      sentenceLike &&
      !codeLike.test(trimmed) &&
      looksTranslatable(trimmed)
    ) {
      gaps.push({ file: rel, line: lineNo, text: trimmed, kind: "文本行" });
    }
    // 3) 用户可见属性字面量
    for (const m of line.matchAll(/\b(placeholder|aria-label|title|alt|label)\s*=\s*"([^"]*)"/g)) {
      const text = m[2] ?? "";
      if (looksTranslatable(text)) {
        gaps.push({ file: rel, line: lineNo, text: `${m[1]}="${text}"`, kind: "属性" });
      }
    }
  });

  return gaps;
}

describe("i18n 反向守卫：可见文案不得硬编码英文", () => {
  const files = ENFORCED.flatMap((dir) => walk(dir));

  it("守卫覆盖到账户区与分销中心（样本数不应为 0，否则守卫形同虚设）", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("账户区 / 分销中心：所有用户可见文案都走 t()", () => {
    const gaps = files.flatMap(scanFile);
    const report = gaps.map((g) => `${g.file}:${g.line} [${g.kind}] ${JSON.stringify(g.text)}`);
    expect(report, `以下文案没有走 t()（中文界面下会漏英文）：\n${report.join("\n")}`).toEqual([]);
  });
});

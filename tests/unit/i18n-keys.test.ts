import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * i18n 覆盖不变量：**源码里每个 t("…") 字面量都必须能在对应词典里命中**。
 *
 * 为什么需要这个断言：
 *   `translate()` 找不到词条时**不报错**，而是回退到 key 本身 —— 也就是英文源串。
 *   后果是中文界面静默显示英文，且构建、类型检查、运行时全都不报任何问题。
 *   2026-09-19 的全量审计就是这样查出 4 个店面键 + 3 个后台键的缺口。
 *   这类缺陷只能靠自动化守卫发现，肉眼与常规 QA 都看不见。
 *
 * 词典归属：`src/app/admin/**` 与 `src/components/admin/**` 用 admin-i18n，
 * 其余（店面、结账、账户）用 shop-i18n。
 */

const ROOT = process.cwd();

/** 把源码里的字符串字面量还原成运行时值（\\ \" \' \n \t 等） */
function unescapeLiteral(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[++i];
    if (n === undefined) break;
    const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'", "`": "`" };
    out += map[n] ?? n;
  }
  return out;
}

/**
 * 去掉注释，避免把注释里举例的 `t("…")` 当成真实调用。
 * 状态机同时跟踪字符串，因此字符串里的 `//`、`/*` 不会被误判为注释开头。
 */
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

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 词典里定义的键（键可为 "…" / '…' / 裸标识符；值对象以 { en: 或 { zh: 开头） */
function dictKeys(file: string): Set<string> {
  const src = fs.readFileSync(file, "utf8");
  const keys = new Set<string>();
  const re =
    /^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*))\s*:\s*\{\s*(?:en|zh)\s*:/gm;
  for (const m of src.matchAll(re)) keys.add(unescapeLiteral(m[1] ?? m[2] ?? m[3] ?? ""));
  return keys;
}

/** 源码里被 t() 实际使用的键（接收源码文本，便于直接对字符串做负向验证） */
function usedKeys(source: string): string[] {
  const src = stripComments(source);
  const keys: string[] = [];
  const re = /\bt\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  for (const m of src.matchAll(re)) keys.push(unescapeLiteral(m[1] ?? m[2] ?? ""));
  return keys;
}

const shopDict = dictKeys(path.join(ROOT, "src/lib/shop-i18n.ts"));
const adminDict = dictKeys(path.join(ROOT, "src/lib/admin-i18n.ts"));

const isAdminPath = (rel: string) => rel.includes("/admin/") || rel.includes("components/admin/");

interface Gap {
  key: string;
  file: string;
}

function collectGaps(): { shop: Gap[]; admin: Gap[]; filesScanned: number; keysScanned: number } {
  const shop: Gap[] = [];
  const admin: Gap[] = [];
  let filesScanned = 0;
  let keysScanned = 0;
  for (const abs of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, abs);
    // 词典自身不参与（其中的键是对象字面量，不是 t() 调用）
    if (/i18n\.ts$/.test(rel)) continue;
    filesScanned++;
    const isAdmin = isAdminPath(rel);
    const dict = isAdmin ? adminDict : shopDict;
    for (const key of usedKeys(fs.readFileSync(abs, "utf8"))) {
      keysScanned++;
      if (dict.has(key)) continue;
      (isAdmin ? admin : shop).push({ key, file: rel });
    }
  }
  return { shop, admin, filesScanned, keysScanned };
}

describe("i18n 覆盖：每个 t() 字面量都能在词典命中", () => {
  const gaps = collectGaps();

  it("店面（shop-i18n）无漏词条的键 —— 否则中文界面会静默显示英文", () => {
    const list = gaps.shop.map((g) => `${JSON.stringify(g.key)}  ← ${g.file}`).join("\n");
    expect(list, `以下键在 shop-i18n.ts 里没有词条：\n${list}`).toBe("");
  });

  it("后台（admin-i18n）无漏词条的键 —— 后台固定 zh 渲染，缺词条同样漏英文", () => {
    const list = gaps.admin.map((g) => `${JSON.stringify(g.key)}  ← ${g.file}`).join("\n");
    expect(list, `以下键在 admin-i18n.ts 里没有词条：\n${list}`).toBe("");
  });

  it("扫描器确实读到了内容（防「遍历为空 → 全绿」的假绿）", () => {
    // 若 walk/正则静默失效，上面两条断言会因为「零缺口」而通过 —— 那是假绿。
    // 因此对扫描规模设下限。
    expect(gaps.filesScanned).toBeGreaterThan(100);
    expect(gaps.keysScanned).toBeGreaterThan(500);
    expect(shopDict.size).toBeGreaterThan(400);
    expect(adminDict.size).toBeGreaterThan(200);
  });

  it("机制有效：凭空出现的键会被判为缺口（负向验证）", () => {
    // 直接在源码文本上验证，**不落盘**：沙箱的安全删除守卫会拦截测试里的
    // 临时文件清理，落盘式测试会因清理失败而假红。
    const bogus = "__definitely_not_in_any_dict__";
    expect(shopDict.has(bogus)).toBe(false);
    expect(adminDict.has(bogus)).toBe(false);
    // 扫描器能认出它，且它不在词典里 —— 因此 collectGaps 会把它计入缺口。
    const found = usedKeys(`const x = t("${bogus}");\n`);
    expect(found).toContain(bogus);
    expect(shopDict.has(found[0]!)).toBe(false);
  });

  it("注释里的 t(\"…\") 示例不算缺口（stripComments 生效）", () => {
    // lang-provider.tsx 的文档注释里写了 t("... {brand} ...")，
    // 它不应当被当成真实调用而报缺口。
    const fake = `/* 说明：写成 t("... {brand} ...", { brand }) */\nconst a = 1; // t("Nope")\n`;
    expect(stripComments(fake)).not.toContain("{brand}");
    expect(stripComments(fake)).not.toContain("Nope");
  });
});

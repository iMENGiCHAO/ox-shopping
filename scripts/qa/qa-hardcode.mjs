#!/usr/bin/env node
/**
 * qa-hardcode.mjs —— 前后端「硬编码」静态扫描（商用交付检查项）
 *
 * 分级：
 *   P0 = 会直接泄漏到**英文前台**、或让商用部署不可配置的问题，必须修。
 *   P1 = 后台界面中文（后台本身是中文产品，属正常）、服务端日志中文、像素魔数。
 *
 * 检查项：
 *   1. 全角标点出现在**代码**里（非注释）—— `：（）、，` 等。
 *      这类字符没有任何合法用途，且是英文 UI 最典型的 i18n 泄漏。
 *      正确做法：走 `lib/shop-i18n` 的 `punct(lang)`。
 *   2. CJK 字符串字面量出现在前台文件里 —— 英文站点会直接把中文显示给用户。
 *   3. 品牌 / 联系方式 / 域名写死 —— 商用部署必须来自站点设置或环境变量。
 *   4. 货币符号 / 美元金额写死 —— 必须走 currency-provider / formatMoney。
 *   5. 像素魔数（P1）—— 版式数值应集中在 globals.css 的 CSS 令牌里。
 *
 * 用法：node scripts/qa/qa-hardcode.mjs [--json]
 * 退出码：存在 P0 时为 1，仅 P1 时为 0。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

// 注意：仓库路径含空格，必须用 fileURLToPath 解码（URL.pathname 会保留 %20）
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const SRC = join(ROOT, "src");
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const json = process.argv.includes("--json");

/** 去掉注释后的代码行（保留字符串内容）。块注释按行状态机处理。 */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const raw of src.split("\n")) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      line = line.slice(end + 2);
      inBlock = false;
    }
    // 行内块注释
    let idx;
    while ((idx = line.indexOf("/*")) !== -1) {
      const end = line.indexOf("*/", idx + 2);
      if (end === -1) {
        line = line.slice(0, idx);
        inBlock = true;
        break;
      }
      line = line.slice(0, idx) + line.slice(end + 2);
    }
    // 行注释：只处理不在字符串里的 //
    let res = "";
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        res += c;
        if (c === "\\") {
          res += line[++i] ?? "";
          continue;
        }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        res += c;
        continue;
      }
      if (c === "/" && line[i + 1] === "/") break;
      res += c;
    }
    out.push(res);
  }
  return out;
}

/** 抽出所有字符串字面量（含模板串） */
function literals(code) {
  const found = [];
  const re = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let m;
  while ((m = re.exec(code))) found.push({ quote: m[1], text: m[2], index: m.index });
  return found;
}

/* ── 判定规则 ───────────────────────────────────────────────────── */

/** 全角标点（CJK 标点 + 全角 ASCII 变体）。代码里出现即泄漏。 */
const FULLWIDTH_PUNCT = /[\u3000-\u303f\uff01-\uff5e]/;
/** 中文字符（不含标点 —— 标点已由上一条覆盖） */
const CJK = /[\u4e00-\u9fff]/;

/**
 * 允许出现中文的文件：这些文件**本身就是内容源**（i18n 字典、内置文案、
 * 政策正文），中文是数据而不是泄漏。
 */
const CJK_ALLOW_FILES = [
  "src/lib/shop-i18n.ts",
  "src/lib/admin-i18n.ts",
  "src/lib/error-i18n.ts",
  "src/lib/faq-defaults.ts",
  "src/lib/searchable-pages.ts",
  "src/lib/catalog.ts",
  "src/lib/policy-content.ts",
];

/** 允许出现货币符号的文件：货币表是符号的**唯一**来源。 */
const MONEY_ALLOW_FILES = ["src/components/shop/currency.ts"];

/** 标准命名空间 / 公开 API 域名 —— 不是「写死的业务域名」。 */
const URL_ALLOW = [
  /schema\.org/,
  /w3\.org/,
  /open\.er-api\.com/,
  /js\.stripe\.com/,
  /hooks\.stripe\.com/,
  /api\.resend\.com/,
];

const BRAND_PATTERNS = [
  { re: /support@example\.com/, why: "写死的客服邮箱" },
  { re: /400-000-0000/, why: "写死的客服电话" },
  { re: /Ox Shopping/, why: "写死的站名（应走站点设置 / SITE_NAME）" },
  { re: /X Corp/, why: "写死的原站版权方" },
  {
    re: /https?:\/\/(?!localhost|127\.0\.0\.1|picsum\.photos)[a-z0-9.-]+\.[a-z]{2,}/i,
    why: "写死的外链域名",
  },
];
/** 允许出现品牌字面量的文件：`env.ts` 是品牌兜底的唯一来源（占位值 + 守卫）。 */
const BRAND_ALLOW_FILES = ["src/lib/env.ts"];

const MONEY = [
  { re: /[¥€£]/, why: "写死的非美元货币符号" },
  { re: /\$\d/, why: "写死的美元金额" },
];

/**
 * 前台文件：这些文件里的中文 / 全角标点会直接进入英文 UI，属 P0。
 *
 * 注意 `src/lib/validations/` 只列**前台用到**的三个 schema ——
 * `admin / product / coupon / payment-channel` 仅服务后台（后台是中文产品），
 * 那里的中文校验消息是正常的，归 P1。
 */
const SHOP_FACING_PREFIXES = ["src/app/(shop)/", "src/components/shop/"];
const SHOP_FACING_FILES = [
  "src/lib/validations/auth.ts",
  "src/lib/validations/cart-order.ts",
  "src/lib/validations/address.ts",
  "src/lib/errors.ts",
  "src/lib/api.ts",
  "src/lib/error-i18n.ts",
  // 客户端 fetch 封装：`apiFetch` 抛出的兜底文案会**直接显示在英文前台的 toast 里**。
  // 2026-09-19 补入 —— 此前这里写死了「请求失败(${status})」，因文件不在前台清单里
  // 而未被扫出，英文站会漏出中文。
  "src/lib/fetch-client.ts",
];
/**
 * 例外：虽然住在 `components/shop/` 下，但它们是 **server-only** 模块，
 * 里面的中文只进服务端日志（`logger.warn` / `captureMessage`），不会到用户界面。
 * 服务端日志沿用中文是本仓库既有约定，不算泄漏。
 */
const SERVER_ONLY_FILES = [
  "src/components/shop/currency-server.ts",
  "src/components/shop/shop-i18n-server.ts",
];
const isShopFacing = (rel) =>
  !SERVER_ONLY_FILES.includes(rel) &&
  (SHOP_FACING_PREFIXES.some((p) => rel.startsWith(p)) || SHOP_FACING_FILES.includes(rel));

/**
 * 双语内容行：走 `pickName / pickLang / pickDescription` 的地方，中文是**数据**
 * （按 lang 二选一），不是泄漏。这类行降为 P1。
 *
 * 同理，`lang === "zh" ? "中文" : "English"` 三元分支虽然也不理想（应走 t()），
 * 但至少不会在英文界面显示中文，因此也只提示、不阻断。
 */
const BILINGUAL_HINT = /pickName\(|pickLang\(|pickDescription\(|lang === "zh"|lang !== "zh"/;

/* ── 扫描 ───────────────────────────────────────────────────────── */

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXTS.has(extname(p))) files.push(p);
  }
})(SRC);

const p0 = [];
const p1 = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  const lines = stripComments(readFileSync(file, "utf8"));
  const cjkAllowed = CJK_ALLOW_FILES.includes(rel);
  const moneyAllowed = MONEY_ALLOW_FILES.includes(rel);

  lines.forEach((line, i) => {
    // 双语内容判断要看**上下文**：`pickName(` 与其参数常分处两行，
    // 只看当前行会误判成泄漏。取前后各 3 行的窗口。
    const bilingual = BILINGUAL_HINT.test(
      lines.slice(Math.max(0, i - 3), i + 4).join(" "),
    );

    // ① 全角标点：扫整行代码（不只字面量）—— JSX 文本节点里的「：」也要抓
    const fw = FULLWIDTH_PUNCT.exec(line);
    if (fw) {
      const item = {
        file: rel,
        line: i + 1,
        kind: "全角标点",
        text: line.trim().slice(0, 70),
      };
      (cjkAllowed || bilingual || !isShopFacing(rel) ? p1 : p0).push(item);
    }

    const lits = literals(line);
    for (const lit of lits) {
      // ② CJK 字面量
      if (CJK.test(lit.text) && !cjkAllowed) {
        const item = {
          file: rel,
          line: i + 1,
          kind: "中文字面量",
          text: lit.text.slice(0, 60),
        };
        (isShopFacing(rel) && !bilingual ? p0 : p1).push(item);
      }
      // ③ 品牌 / 联系方式 / 域名
      if (!BRAND_ALLOW_FILES.includes(rel)) {
        for (const { re, why } of BRAND_PATTERNS) {
          if (!re.test(lit.text)) continue;
          if (URL_ALLOW.some((a) => a.test(lit.text))) continue;
          p0.push({ file: rel, line: i + 1, kind: why, text: lit.text.slice(0, 60) });
        }
      }
      // ④ 货币
      if (!moneyAllowed && !/className|https?:/.test(lit.text)) {
        for (const { re, why } of MONEY) {
          if (re.test(lit.text)) {
            p0.push({ file: rel, line: i + 1, kind: why, text: lit.text.slice(0, 60) });
          }
        }
      }
    }

    // ⑤ 像素魔数：仅扫 tsx 的 className 里的 Npx（≥3px；0/1/2px 描边属正常）
    if (extname(file) === ".tsx") {
      const re = /\b(?:[a-z-]*:)?[a-z-]+-\[(\d{3,})px\]/g;
      let m;
      while ((m = re.exec(line))) {
        p1.push({ file: rel, line: i + 1, kind: "像素魔数", text: m[0] });
      }
    }
  });
}

/* ── 输出 ───────────────────────────────────────────────────────── */

const group = (arr) => {
  const g = new Map();
  for (const it of arr) {
    if (!g.has(it.kind)) g.set(it.kind, []);
    g.get(it.kind).push(it);
  }
  return g;
};

if (json) {
  console.log(JSON.stringify({ p0, p1 }, null, 1));
} else {
  console.log(`扫描 ${files.length} 个源文件\n`);
  console.log(`── P0（泄漏到英文前台 / 商用阻断）共 ${p0.length} 处`);
  if (p0.length === 0) console.log("   ✅ 无");
  for (const [kind, items] of group(p0)) {
    console.log(`\n[${kind}] ${items.length} 处`);
    for (const it of items.slice(0, 25)) console.log(`  ${it.file}:${it.line}  ${it.text}`);
    if (items.length > 25) console.log(`  … 其余 ${items.length - 25} 处`);
  }
  console.log(`\n── P1（后台中文 / 服务端日志 / 像素魔数，提示级）共 ${p1.length} 处`);
  for (const [kind, items] of group(p1)) {
    console.log(`\n[${kind}] ${items.length} 处`);
    for (const it of items.slice(0, 8)) console.log(`  ${it.file}:${it.line}  ${it.text}`);
    if (items.length > 8) console.log(`  … 其余 ${items.length - 8} 处`);
  }
}
process.exit(p0.length ? 1 : 0);

#!/usr/bin/env node
/**
 * 词典僵尸词条清理 v3（一次性脚本，用完即删）
 *
 * v1/v2 教训：
 *   - v2 的「向下找 `},` 行」在多行块边界吃过头，误删了相邻活词条（Save/Cancel 等）。
 * v3 的三道保险：
 *   1. 活词条白名单 = i18n-keys.test 同款 t() AST 收集器 ∪ 全文 includes 引用（src+tests），
 *      双口径取并集 —— t() 之外的引用（测试断言、动态构造）也不会误删；
 *   2. 删除用**括号计数**定位块边界（数 `{`/`}` 至平衡），不依赖缩进/闭合行形态；
 *   3. 删完跑 i18n-keys（正向）+ i18n-dict-lean（反向）双测试验证。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/* ── 与 tests/unit/i18n-keys.test.ts 同款解析工具 ─────────────────── */
function unescapeLiteral(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = raw[++i];
    if (n === undefined) break;
    const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'", "`": "`" };
    out += map[n] ?? n;
  }
  return out;
}

function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
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
        const s = src[i];
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

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

function usedKeys(source) {
  const src = stripComments(source);
  const keys = [];
  // t() 与 translate() 都是词典消费方（服务端 fetch-client 有字面 translate 调用）
  const re = /\b(?:t|translate)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
  for (const m of src.matchAll(re)) keys.push(unescapeLiteral(m[1] ?? m[2] ?? ""));
  return keys;
}

/* ── 收集白名单：t() keys ∪ includes 引用 ────────────────────────── */
const allFiles = walk(join(ROOT, "src")).concat(walk(join(ROOT, "tests")));
const isAdminPath = (f) => f.includes("/admin/") || f.includes("components/admin/");
const liveKeys = { shop: new Set(), admin: new Set() };

for (const abs of allFiles) {
  const rel = abs.replace(ROOT + "/", "");
  if (/i18n\.ts$/.test(rel)) continue; // 词典自身的 key 定义不算引用
  const src = readFileSync(abs, "utf8");
  const scope = isAdminPath(rel) ? "admin" : "shop";
  for (const k of usedKeys(src)) liveKeys[scope].add(k);
}

/* includes 终审缓存：每个候选死 key 在删前全项目再扫一遍（防 t() 之外的引用） */
const haystackCache = allFiles
  .map((abs) => abs.replace(ROOT + "/", ""))
  .filter((rel) => !/i18n\.ts$/.test(rel))
  .map((rel) => readFileSync(join(ROOT, rel), "utf8"));
const includesAlive = (key) =>
  haystackCache.some((src) => src.includes(key) || src.includes(`"${key}"`));

/* ── 提取 DICT 词条块（括号计数），删除白名单之外的 ───────────────── */
const DICT_FILES = {
  admin: "src/lib/admin-i18n.ts",
  shop: "src/lib/shop-i18n.ts",
};

for (const [scope, file] of Object.entries(DICT_FILES)) {
  const src = readFileSync(join(ROOT, file), "utf8");
  const dictStart = src.indexOf("const DICT");
  const head = src.slice(0, dictStart);
  const body = src.slice(dictStart);

  // 与 i18n-keys 的 dictKeys 同款正则（\s* 可跨行，兼容多行块形态）
  const keyRe =
    /^[ \t]*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s"'{}:,()]+))[ \t]*:[ \t]*\{[ \t]*(?:en|zh)[ \t]*:/gm;

  const entries = []; // { start: 偏移, key, blockEnd: 偏移 }
  for (const m of body.matchAll(keyRe)) {
    const key = unescapeLiteral(m[1] ?? m[2] ?? m[3] ?? "");
    // 从 `{` 起括号计数找块尾
    let depth = 0;
    let i = m.index + m[0].indexOf("{");
    let inStr = null;
    for (; i < body.length; i++) {
      const c = body[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") inStr = c;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    // 吃掉尾随逗号与行尾
    let end = i + 1;
    if (body[end] === ",") end++;
    if (body[end] === "\n") end++;
    entries.push({ start: m.index, key, end });
  }

  const dead = entries.filter((e) => !liveKeys[scope].has(e.key) && !includesAlive(e.key));
  // 从后往前删，偏移不漂移
  let out = body;
  for (const e of [...dead].reverse()) {
    out = out.slice(0, e.start) + out.slice(e.end);
  }
  out = out.replace(/\n{3,}/g, "\n\n");
  writeFileSync(join(ROOT, file), head + out);
  console.log(`${file}: 词条 ${entries.length}，删零引用 ${dead.length}`);
}

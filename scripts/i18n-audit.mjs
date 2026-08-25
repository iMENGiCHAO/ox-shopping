#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * i18n 覆盖率审计：扫描源码中的 t("...") 调用，与 shop/admin 字典比对。
 * 输出缺失键清单与覆盖率；退出码 1 表示有缺失（可接入 CI）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src");
const DICT_FILES = ["src/lib/shop-i18n.ts", "src/lib/admin-i18n.ts"];

function collectKeys(file) {
  const src = readFileSync(file, "utf8");
  const keys = new Set();
  // 风格一："key": { en: "...", zh: "..." }
  const reQ = /^\s*"((?:[^"\\]|\\.)+)":\s*\{/gm;
  // 风格二：Key: { zh: "..." }（en 回退为键名）
  const reB = /^\s*([A-Za-z_$][\w$]*):\s*\{\s*(?:en|zh):/gm;
  let m;
  while ((m = reQ.exec(src))) keys.add(JSON.parse(`"${m[1]}"`));
  while ((m = reB.exec(src))) {
    if (!["en", "zh"].includes(m[1])) keys.add(m[1]);
  }
  return keys;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(p)) out.push(p);
  }
  return out;
}

const dict = new Set();
for (const f of DICT_FILES) {
  try {
    for (const k of collectKeys(f)) dict.add(k);
  } catch (e) {
    console.error(`dict parse failed: ${f}: ${e.message}`);
  }
}

const used = new Map(); // key -> first file
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  const re = /\bt\(\s*"((?:[^"\\]|\\.)+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const key = JSON.parse(`"${m[1]}"`);
    if (!used.has(key)) used.set(key, path.relative(process.cwd(), file));
  }
}

const missing = [...used.keys()].filter((k) => !dict.has(k)).sort();
console.log(`字典条目: ${dict.size}`);
console.log(`t() 引用的键: ${used.size}`);
console.log(`缺失(回退英文原文): ${missing.length}`);
if (missing.length) {
  console.log("\n缺失键(前 40):");
  for (const k of missing.slice(0, 40)) console.log(`  - [${used.get(k)}] ${k.slice(0, 80)}`);
}
process.exit(missing.length ? 1 : 0);

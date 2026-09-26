/**
 * 词典反向卫生测试（2026-09-24 死代码清理转正）
 *
 * 正向测试（i18n-keys.test.ts）保证「代码引用的 key 必须在 DICT」；
 * 本测试补反向：「DICT 里的词条必须被代码引用」—— 零引用词条是之前迭代
 * 换文案留下的尸块，会在两本千行词典里无限堆积。加进单测门禁后，
 * 新的死词条 CI 直接红，不再需要周期性人工清扫。
 *
 * 判定口径与清理时的脚本一致：key 字面在 src/ + tests/ 全文（排除词典自身）
 * 出现 ≥1 次即算被引用。全项目 t() 均为字面调用（无模板串动态 key），
 * 该口径安全 —— 若未来引入动态 key，请在用到的词条处加豁免注释并更新本口径。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const DICT_FILES = ["src/lib/admin-i18n.ts", "src/lib/shop-i18n.ts"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function extractDictKeys(file: string): Set<string> {
  const src = readFileSync(join(ROOT, file), "utf8");
  const keys = new Set<string>();
  const start = src.indexOf("const DICT");
  const body = src.slice(start);
  const re = /^ {2}(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*)):(?= \{|\s*\{)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) keys.add(m[1] ?? m[2] ?? m[3] ?? "");
  return keys;
}

/** 所有源码文件的内容缓存（词条量大，逐 key 全文件扫描靠缓存兜住耗时） */
const haystackFiles = walk(join(ROOT, "src")).concat(walk(join(ROOT, "tests")));
const haystackCache = haystackFiles
  .filter((f) => !DICT_FILES.includes(relative(ROOT, f) as (typeof DICT_FILES)[number]))
  .map((f) => readFileSync(f, "utf8"));

describe("词典反向卫生：DICT 里不允许零引用的僵尸词条", () => {
  for (const dictFile of DICT_FILES) {
    it(`${dictFile} 的全部词条均被引用`, () => {
      const keys = extractDictKeys(dictFile);
      const dead: string[] = [];
      for (const key of keys) {
        const quoted = `"${key}"`;
        const alive = haystackCache.some((src) => src.includes(key) || src.includes(quoted));
        if (!alive) dead.push(key);
      }
      // 给排障留线索：失败时打印前 30 条死词条
      expect(dead.slice(0, 30), `零引用词条 ${dead.length} 条（前 30 条如上）`).toEqual([]);
    });
  }
});

/**
 * 定向扫描：**API 错误文案里的硬编码中文**。
 *
 * 为什么需要单独扫：`qa-hardcode.mjs` 只把「前台目录」的文件当 P0，而
 * `unauthorized("中文")` 这类文案会经 `apiHandler` 原样返回给**英文站用户**
 * （ERROR_ZH 只做英→中，不做中→英），是典型的 P0 泄漏，却因为文件不在
 * 前台目录下而被漏掉。
 *
 * ⚠️ 本脚本曾经有过一个致命假阴性（已修）：
 * 旧实现用 `new ApiError\(\s*(?:`|")` 匹配，要求引号**紧跟左括号**。
 * 但 `ApiError` 的签名是 `(status, code, message)` —— 文案在**第三个**参数，
 * 于是全部 `new ApiError(400, "BAD_REQUEST", "中文")` 都匹配不到，
 * 脚本报「✅ 0 处」，而实际上 `src/server/services/order.service.ts` 里
 * 躺着十余处中文错误文案（其中 `无权访问该订单` 会直接漏给英文站顾客）。
 * **一个会谎报 0 的扫描器比没有扫描器更糟**，因为它制造虚假信心。
 * 现在的实现改为：定位构造器调用 → 平衡括号截取整个实参表 → 在实参里找
 * 含中文的字符串字面量（单引号 / 双引号 / 模板串），支持多行调用。
 *
 * 用法：node scripts/qa/qa-error-lang.mjs
 * 退出码：存在命中 → 1
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const CJK = /[\u4e00-\u9fff]/;

/** 会把文案直接放进 API 响应体的构造器 */
const CTORS = [
  "unauthorized",
  "forbidden",
  "badRequest",
  "notFound",
  "conflict",
  "rateLimited",
  "unprocessable",
  "new ApiError",
];

/**
 * 后台（`/api/admin/*`）是**中文产品**：管理员的界面语言由独立的 `admin-lang`
 * cookie 决定，那里的中文错误文案是正常的。
 *
 * 这条**按路径**的豁免之所以成立，靠的是一个显式机制而不是约定：
 * `lib/api.ts` 的 `apiHandler` 对 `/api/admin/*` 恒按中文本地化
 * （见 `request-lang.ts` 的 `isAdminApiPath`）。也就是说后台的中文是**被保证**的，
 * 不依赖店主把店面切成了什么语言。若没有那个机制，这里就不该按路径豁免 ——
 * 因为「源串是中文」只是碰巧让后台显示中文，一旦有人把源串改成英文，
 * 中文后台就会开始报英文。
 *
 * 注意：`/api/admin/*` 之外的**共享代码**（如 `server/services/order.service.ts`）
 * 不能按目录推断归属 —— 那个文件里既有后台专属文案，也有 `assertOrderAccess`
 * 这种顾客侧鉴权文案。这类情况必须逐处显式标注 `qa-error-lang: admin-only`。
 */
const ADMIN_ONLY = [/^src\/app\/api\/admin\//, /^src\/lib\/admin-/];
const ADMIN_MARK = /qa-error-lang:\s*admin-only/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * 从 `from` 处（已确认是构造器名之后）截取到配对的右括号。
 * 处理字符串字面量内的括号与转义，避免被 `"("` 之类提前收尾。
 * 返回 { text, endIndex }；括号不配对时返回到文件末尾（调用方按原文判断）。
 */
function sliceCall(src, from) {
  let i = from;
  let depth = 0;
  let quote = null;
  let started = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      started = true;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (started && depth === 0) return { text: src.slice(from, i + 1), endIndex: i };
    }
  }
  return { text: src.slice(from, Math.min(src.length, from + 600)), endIndex: src.length };
}

/** 抽出文本里所有含中文的字符串字面量（含模板串） */
function cjkStringLiterals(text) {
  const found = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(text))) {
    const value = m[1] ?? m[2] ?? m[3] ?? "";
    if (CJK.test(value)) found.push(value.trim());
  }
  return found;
}

/** 该行是否处于注释里（`*` 开头的块注释行或 `//` 行注释行） */
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

const hits = [];
const skipped = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, "utf8");
  const lineStarts = [];
  for (let i = 0, n = 1; i < src.length; i++) {
    lineStarts[n] = lineStarts[n] ?? i;
    if (src[i] === "\n") n++;
  }
  const lineOf = (idx) => {
    let n = 1;
    for (let i = 1; i < lineStarts.length; i++) {
      if (lineStarts[i] === undefined) break;
      if (lineStarts[i] <= idx) n = i;
      else break;
    }
    return n;
  };

  for (const ctor of CTORS) {
    // 构造器名后面必须紧跟 `(`（允许空白），避免命中 `foo.badRequest(` 之外的同名片段
    const re = new RegExp(`\\b${ctor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`, "g");
    let m;
    while ((m = re.exec(src))) {
      const parenIdx = m.index + m[0].length - 1;
      const line = lineOf(m.index);
      const lineText = src.slice(lineStarts[line], (src.indexOf("\n", lineStarts[line]) + 1) || undefined);
      if (isCommentLine(lineText)) continue;

      const { text } = sliceCall(src, parenIdx);
      const cjk = cjkStringLiterals(text);
      if (cjk.length === 0) continue;

      // 豁免：整条路由只给后台（/api/admin/*），或本行/上一行显式标注了 admin-only
      const prevLine = line > 1 ? src.slice(lineStarts[line - 1], lineStarts[line]) : "";
      const exempt =
        ADMIN_ONLY.some((re2) => re2.test(rel)) ||
        ADMIN_MARK.test(lineText) ||
        ADMIN_MARK.test(prevLine);
      const item = {
        rel,
        line,
        text: `${lineText.trim().slice(0, 110)}${lineText.trim().length > 110 ? "…" : ""}`,
        cjk: cjk.map((s) => s.slice(0, 60)),
      };
      (exempt ? skipped : hits).push(item);
    }
  }
}

if (hits.length === 0) {
  console.log("✅ 未发现「顾客可见的 API 错误文案硬编码中文」——英文站不会漏出中文错误提示");
  console.log(`   （已按行内 admin-only 标记豁免 ${skipped.length} 处：后台是中文产品）`);
  process.exit(0);
}

console.log(`❌ 发现 ${hits.length} 处顾客可见的 API 错误文案硬编码中文（英文站会漏出中文）：\n`);
for (const h of hits) {
  console.log(`  ${h.rel}:${h.line}`);
  console.log(`     ${h.text}`);
  for (const s of h.cjk) console.log(`     ↳ 中文文案：${s}`);
}
console.log(
  "\n修法：把构造器参数改成**英文源串**，再到 `src/lib/error-i18n.ts` 的 ERROR_ZH 补一条中文" +
    "（带插值的文案补 PATTERN_ZH）。",
);
console.log(
  "\n确属后台专属（`/api/admin/*` 才会走到）时，在该行或其上一行加注释 " +
    "`qa-error-lang: admin-only` 并写明理由 —— 豁免必须显式，不靠目录推断。",
);
console.log(`（已按行内标记豁免 ${skipped.length} 处）`);
process.exit(1);

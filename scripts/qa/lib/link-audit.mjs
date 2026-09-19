/**
 * 静态链接审计的共享实现 —— 由 `scripts/qa/qa-links-static.mjs`（人读诊断）
 * 与 `tests/unit/nav-routes.test.ts`（CI 守卫）共用，避免两份逻辑漂移。
 */
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const APP = path.join(ROOT, "src/app");
export const PUBLIC = path.join(ROOT, "public");

/**
 * 已知的「相对拼接尾段」白名单。
 *
 * 这些字符串形如 `/pay`、`/cancel`，是被 `orderApiUrl(orderNumber, token, "/pay")`
 * 拼在 `/api/orders/<no>` 后面的**尾段**，不是站内路径。
 * 静态扫描无法区分「尾段」与「真路径」，因此显式列出。
 *
 * **新增未匹配路径时必须在这里显式登记** —— 这是刻意的摩擦：
 * 它强迫每一条「看起来像路径的字符串」都被人工确认过一次，
 * 而不是被静默忽略（那正是死链漏检的成因）。
 */
export const KNOWN_API_SUFFIXES = new Set([
  "/pay",
  "/cancel",
  "/refund",
  "/reorder",
  "/invoice",
  "/mock-pay",
  "/confirm-delivery",
]);

/** 已知的「非路径」字符串（语言码等） */
export const KNOWN_NON_PATHS = new Set(["/zh", "/en"]);

export function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 去掉注释，避免把注释里举例的 URL 当成真实链接（状态机同时跟踪字符串） */
export function stripComments(src) {
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

/** app 目录下的路由模式：[param] → *，去掉路由组 (xxx) */
export function routePatterns() {
  const routes = new Set();
  for (const f of walk(APP)) {
    const parts = path.relative(APP, f).split(path.sep);
    const base = parts.pop();
    if (!/^(page|route)\.(tsx|ts)$/.test(base)) continue;
    const segs = parts.filter((s) => !/^\(.*\)$/.test(s)).map((s) => (/^\[.*\]$/.test(s) ? "*" : s));
    routes.add("/" + segs.join("/"));
  }
  return routes;
}

export function matches(urlPath, pattern) {
  const u = urlPath.split("/").filter(Boolean);
  const p = pattern.split("/").filter(Boolean);
  if (u.length !== p.length) return false;
  return p.every((seg, i) => seg === "*" || seg === u[i]);
}

export function resolveRoute(urlPath, routes) {
  for (const p of routes) if (matches(urlPath, p)) return p;
  return null;
}

/** 形如 /foo/bar 的路径字面量；白名单排除正则字面量（如 /^\//） */
const PATH_LIKE = /^\/[A-Za-z0-9\-_/[\].]*$/;

export function collectPaths(files) {
  const found = new Map();
  let scanned = 0;
  let skippedDynamic = 0;
  for (const f of files) {
    const src = stripComments(fs.readFileSync(f, "utf8"));
    const rel = path.relative(ROOT, f);
    for (const re of [/"(\/[^"\n]*)"/g, /'(\/[^'\n]*)'/g, /`(\/[^`\n]*)`/g]) {
      for (const m of src.matchAll(re)) {
        let url = m[1];
        scanned++;
        if (url.includes("${")) {
          skippedDynamic++;
          continue;
        }
        url = url.split("?")[0].split("#")[0];
        if (!url || url.startsWith("//")) continue;
        if (!PATH_LIKE.test(url)) continue;
        if (!found.has(url)) found.set(url, new Set());
        found.get(url).add(rel);
      }
    }
  }
  return { found, scanned, skippedDynamic };
}

/** 店面侧需要审计的文件集合 */
export function auditTargets() {
  const dirs = ["src/components/shop", "src/app/(shop)", "src/app/(checkout)"].map((p) =>
    path.join(ROOT, p),
  );
  const extras = ["src/lib/footer-nav.ts", "src/lib/account-nav.ts", "src/lib/searchable-pages.ts"]
    .map((p) => path.join(ROOT, p))
    .filter((p) => fs.existsSync(p));
  return [...dirs.filter((d) => fs.existsSync(d)).flatMap((d) => walk(d)), ...extras];
}

/** 执行审计，返回分类结果 */
export function auditLinks() {
  const routes = routePatterns();
  const files = auditTargets();
  const { found, scanned, skippedDynamic } = collectPaths(files);

  const matchedRoute = [];
  const matchedAsset = [];
  const missingAsset = [];
  const unmatched = [];

  for (const [url, set] of [...found].sort()) {
    const owners = [...set];
    if (resolveRoute(url, routes)) {
      matchedRoute.push(url);
      continue;
    }
    if (fs.existsSync(path.join(PUBLIC, url.replace(/^\//, "")))) {
      matchedAsset.push(url);
      continue;
    }
    if (KNOWN_API_SUFFIXES.has(url) || KNOWN_NON_PATHS.has(url)) continue;
    if (/\.[A-Za-z0-9]{2,5}$/.test(url)) missingAsset.push({ url, owners });
    else unmatched.push({ url, owners });
  }

  return {
    routeCount: routes.size,
    fileCount: files.length,
    scanned,
    skippedDynamic,
    uniquePaths: found.size,
    matchedRoute,
    matchedAsset,
    missingAsset,
    unmatched,
  };
}

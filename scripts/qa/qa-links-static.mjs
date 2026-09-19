/**
 * 静态死链审计（人读诊断版）。
 *
 * 逻辑在 `scripts/qa/lib/link-audit.mjs`，与 `tests/unit/nav-routes.test.ts` 共用。
 * 与 `qa-links.mjs`（Playwright 运行时爬取）互补：本脚本静态、秒级、无需 dev server。
 *
 * 用法：node scripts/qa/qa-links-static.mjs
 * 只输出、不写文件；始终 exit 0（诊断脚本不阻断流程）。
 */
import { auditLinks, KNOWN_API_SUFFIXES, KNOWN_NON_PATHS } from "./lib/link-audit.mjs";

const r = auditLinks();

console.log(`路由模式 ${r.routeCount} 条`);
console.log(
  `扫描 ${r.fileCount} 个文件，命中形如 /… 的字面量 ${r.scanned} 个` +
    `（动态拼接跳过 ${r.skippedDynamic} 个），去重后待校验 ${r.uniquePaths} 个\n`,
);

console.log(`✅ 命中路由 ${r.matchedRoute.length} 个`);
console.log(`✅ 命中 public 资源 ${r.matchedAsset.length} 个`);

if (r.missingAsset.length > 0) {
  console.log(`\n❌ 引用了不存在的静态资源 ${r.missingAsset.length} 个：`);
  for (const d of r.missingAsset) {
    console.log(`  ${d.url}`);
    for (const f of d.owners) console.log(`      ← ${f}`);
  }
} else {
  console.log("✅ 无缺失的静态资源引用");
}

if (r.unmatched.length > 0) {
  console.log(`\n❌ 未匹配的路径 ${r.unmatched.length} 个（若非误报请登记白名单）：`);
  for (const d of r.unmatched) console.log(`  ${d.url}   ← ${d.owners.join(", ")}`);
} else {
  console.log("✅ 无未匹配的路径");
}

console.log(
  `\n白名单：API 尾段 ${KNOWN_API_SUFFIXES.size} 个、非路径 ${KNOWN_NON_PATHS.size} 个` +
    `（新增未匹配路径时必须显式登记，见 lib/link-audit.mjs 注释）`,
);

process.exit(0);

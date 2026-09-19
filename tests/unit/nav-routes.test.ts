import { describe, expect, it } from "vitest";
import { auditLinks } from "../../scripts/qa/lib/link-audit.mjs";

/**
 * 死链守卫。
 *
 * 为什么需要：站内路径写错（`/pages/coupons` 少一段、`/account/login` 与实际的
 * `/auth/login` 不一致）**不会报错** —— 点击后才 404，或者图片静默不显示。
 * 构建、类型检查、运行时都不会拦。这类缺陷只能靠自动化守卫发现。
 *
 * 判定口径：店面源码里每个形如 `/foo/bar` 的字符串，必须至少满足其一：
 *   1. 能匹配到 `src/app` 下的真实路由；
 *   2. 能在 `public/` 找到对应文件；
 *   3. 显式登记在 `lib/link-audit.mjs` 的白名单里（API 拼接尾段 / 语言码）。
 *
 * 第 3 条是**刻意的摩擦**：新增的未匹配路径会红，强迫人工确认一次，
 * 而不是被静默忽略 —— 静默忽略正是死链漏检的成因。
 */
describe("死链守卫：静态内部路径都能落地", () => {
  const r = auditLinks();

  it("没有引用不存在的静态资源", () => {
    const list = r.missingAsset.map((d) => `${d.url}  ← ${d.owners.join(", ")}`).join("\n");
    expect(list, `以下资源在 public/ 下不存在：\n${list}`).toBe("");
  });

  it("没有无法落地且未登记的路径", () => {
    const list = r.unmatched.map((d) => `${d.url}  ← ${d.owners.join(", ")}`).join("\n");
    expect(
      list,
      `以下路径既不是路由、也不是 public 资源、也不在白名单里：\n${list}\n` +
        `若确认是 API 拼接尾段，请登记到 scripts/qa/lib/link-audit.mjs 的 KNOWN_API_SUFFIXES`,
    ).toBe("");
  });

  it("扫描器确实读到了内容（防「遍历为空 → 全绿」的假绿）", () => {
    // 若目录遍历或正则静默失效，上面两条会因「零异常」而通过 —— 那是假绿。
    expect(r.fileCount).toBeGreaterThan(50);
    expect(r.uniquePaths).toBeGreaterThan(30);
    expect(r.matchedRoute.length).toBeGreaterThan(20);
  });
});

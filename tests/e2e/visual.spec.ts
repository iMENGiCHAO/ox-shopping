import { test, expect } from "@playwright/test";

/**
 * 视觉回归基线（P2-4）：对关键页做固定视口截图对比。
 *
 * 首次运行 `npm run test:e2e -- --update-snapshots` 生成基线并入库；
 * 此后 UI 改动以「基线差异」为验收输入，替代主观目测。
 *
 * 注意：
 *  - 基线锁定**英文（无前缀，canonical）**页面，对应上游参考站的黑白极简风格。
 *  - 用 base @playwright/test（不带 zh cookie），确保截到英文版。
 *  - 固定视口 1440×900（与 docs/SESSION_SUMMARY.md §2.1 实测基准一致）。
 *  - 等待网络空闲 + 图片加载完成后再截图，避免首屏竞态导致基线抖动。
 */

const VIEWPORT = { width: 1440, height: 900 };

async function settle(page: import("@playwright/test").Page) {
  // 隐藏 Next.js dev 开发者工具徽章（左下角，位置/状态会变 → 基线抖动 ~0.01 像素差；
  // 生产构建无此元素，隐藏不影响产品）
  // 隐藏 Cookie consent 横幅：客户端挂载延迟渲染竞态（轮次间出现与否不定，
  // 实测 cart-empty 900↔1019px 抖动）；横幅是全局组件非页面内容，不锁基线。
  await page
    .addStyleTag({
      content: `\
[data-nextjs-dev-tools-button], nextjs-portal { display: none !important; }
.fixed.inset-x-0.bottom-0.z-50.border-t { display: none !important; }`,
    })
    .catch(() => {});
  // 等 DOM 与主资源加载完（不用 networkidle：长连接/后台轮询会让它永远不满足而挂起）
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
  // 触发懒加载：先滚到底再回顶（loading=lazy 的图在视口外永远不会 complete，
  // fullPage 截图滚动拼接时才加载 → 两次连续截图不稳定。先滚动让它们全部进过视口）。
  await page
    .evaluate(
      () =>
        new Promise<void>((resolve) => {
          let y = 0;
          const step = () => {
            y += 600;
            window.scrollTo(0, y);
            if (y < document.body.scrollHeight) setTimeout(step, 60);
            else {
              window.scrollTo(0, 0);
              setTimeout(resolve, 300);
            }
          };
          step();
        }),
    )
    .catch(() => {});
  // 等全部图片加载完成，并修复「假完成」的兜底占位图：
  // dev 慢速网络卷上 /_next/image 偶发失败 → ImageWithFallback 把 img.src 换成
  // 1×1 灰色 data-URI（complete=true 且 naturalWidth=1，上面的 complete 轮询会
  // 提前放行）→ 灰卡被烙进基线，下一轮加载成功即整行像素差异（实测 PLP
  // 末行 606K px）。对策：识别占位（naturalWidth<=2）并从 srcset 强制重载真实源，
  // 轮询直到所有图都「complete 且真图尺寸>2 或确实无真实源」。
  await page
    .evaluate(async () => {
      const realSrc = (img: HTMLImageElement): string | null => {
        // srcset 第一个候选是真实 /_next/image URL；data: 源不算
        const ss = (img.getAttribute("srcset") || "").split(",")[0]?.trim().split(" ")[0];
        if (ss && !ss.startsWith("data:")) return ss;
        if (img.currentSrc && !img.currentSrc.startsWith("data:")) return img.currentSrc;
        if (img.src && !img.src.startsWith("data:")) return img.src;
        return null;
      };
      const deadline = Date.now() + 45_000;
      let lastForce = 0;
      while (Date.now() < deadline) {
        const bad = Array.from(document.images).filter((img) => {
          if (!img.complete) return true;
          // 占位图但存在真实源 → 视为未完成
          if (img.naturalWidth <= 2 && realSrc(img)) return true;
          return false;
        });
        if (bad.length === 0) break;
        if (Date.now() - lastForce > 5_000) {
          // 强制懒图立即加载：快滚 60ms/步时 Chromium 懒加载调度器可能漏掉
          // 底部图（请求根本不发出，!complete 卡满 45s）→ loading=eager + 显式
          // 赋 src 直接触发抓取，不依赖视口相交
          for (const img of bad) {
            img.loading = "eager";
            const orig = realSrc(img);
            if (orig && img.complete && img.naturalWidth <= 2) img.src = orig;
          }
          lastForce = Date.now();
        }
        await Promise.race([
          Promise.all(
            bad.map((img) => new Promise((r) => img.addEventListener("load", r, { once: true }))),
          ),
          new Promise((r) => setTimeout(r, 1_000)),
        ]);
      }
    })
    .catch(() => {});
  // 给懒加载/轮播/入场动画一点稳定时间
  await page.waitForTimeout(400);
}

// 视觉基线容差在 playwright.config.ts expect.toHaveScreenshot（maxDiffPixelRatio 2%：
// 吸收 Chromium 抗锯齿/全页拼接亚像素噪声，实测顶栏边缘约 1% 抖动；真实回归
// （占位图烙基线 30%+、排序换品 10%+）远超此阈值
test.use({ viewport: VIEWPORT });

test.describe("视觉回归基线", () => {
  test.setTimeout(180_000);

  test("首页", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page).toHaveScreenshot("home.png", { fullPage: true });
  });

  test("集合索引 All collections", async ({ page }) => {
    // 原站 `/products` 与 `/collections` 都是这个索引页（4 张正方形集合卡片）
    await page.goto("/collections");
    await settle(page);
    await expect(page).toHaveScreenshot("collections.png", { fullPage: true });
  });

  test("商品列表 PLP", async ({ page }) => {
    // 商品网格在原站形态的集合页（`/products` 已改为 All collections 索引页）
    await page.goto("/collections/ox-essentials-collection");
    await settle(page);
    await expect(page).toHaveScreenshot("plp.png", { fullPage: true });
  });

  test("商品详情 PDP", async ({ page }) => {
    // 固定商品（不再用"PLP 第一张卡"——shop.spec 全量购买会让第一张卡易主，
    // PDP 基线整页漂移；固定一个 E2E 不购买、库存稳定的商品）
    await page.goto("/products/ox-thermal-beanie");
    // PDP 就绪标志：加购按钮出现（英文站默认语言）
    await page.getByRole("button", { name: /Add to bag|Add to cart/i }).waitFor({
      timeout: 30_000,
    });
    await settle(page);
    await expect(page).toHaveScreenshot("pdp.png", {
      fullPage: true,
      // 推荐区（"You may also like"）内容数据驱动：随销量/相关度动态排序，
      // E2E 全量购买会改变推荐集 → 不锁基线，mask 跳过该 section（业务上本就不该锁）。
      mask: [page.locator('section:has(h2:has-text("You may also like"))')],
    });
  });

  test("购物车空态", async ({ page }) => {
    await page.goto("/cart");
    await settle(page);
    await expect(page).toHaveScreenshot("cart-empty.png", { fullPage: true });
  });

  test("搜索弹层", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    // 打开顶栏搜索浮层：等弹层真正出现再截图（此前固定 600ms 在慢卷上会拍成
    // 「弹层未打开」的全页差异，实测 flaky 35% 像素差）
    const searchTrigger = page.getByRole("button", { name: /search|搜索/i }).first();
    if (await searchTrigger.isVisible().catch(() => false)) {
      await searchTrigger.click();
      await page
        .getByPlaceholder(/搜索|Search/i)
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
        .catch(() => {});
      await page.waitForTimeout(800);
    }
    // 弹层自动 focus 输入框：光标闪烁相位会让基线抖动（~0.01 像素差），截图前失焦
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.waitForTimeout(150);
    await expect(page).toHaveScreenshot("search-overlay.png", { fullPage: false });
  });
});

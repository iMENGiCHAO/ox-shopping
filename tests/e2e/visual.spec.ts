import { test, expect } from "@playwright/test";

/**
 * 视觉回归基线（P2-4）：对关键页做固定视口截图对比。
 *
 * 首次运行 `npm run test:e2e -- --update-snapshots` 生成基线并入库；
 * 此后 UI 改动以「基线差异」为验收输入，替代主观目测。
 *
 * 注意：
 *  - 基线锁定**英文（无前缀，canonical）**页面，对应 shop.x.com 黑白极简参考。
 *  - 用 base @playwright/test（不带 zh cookie），确保截到英文版。
 *  - 固定视口 1440×900（与 docs/SESSION_SUMMARY.md §2.1 实测基准一致）。
 *  - 等待网络空闲 + 图片加载完成后再截图，避免首屏竞态导致基线抖动。
 */

const VIEWPORT = { width: 1440, height: 900 };

async function settle(page: import("@playwright/test").Page) {
  // 等 DOM 与主资源加载完（不用 networkidle：长连接/后台轮询会让它永远不满足而挂起）
  await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
  // 等首屏图片加载，带硬超时兜底（懒加载图未进 DOM / load 事件丢失时不卡死）
  await page
    .evaluate(
      () =>
        Promise.race([
          Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise((r) => img.addEventListener("load", r, { once: true })),
              ),
          ),
          new Promise((r) => setTimeout(r, 5000)),
        ]),
    )
    .catch(() => {});
  // 给懒加载/轮播/入场动画一点稳定时间
  await page.waitForTimeout(400);
}

test.use({ viewport: VIEWPORT });

test.describe("视觉回归基线", () => {
  test.setTimeout(180_000);

  test("首页", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    await expect(page).toHaveScreenshot("home.png", { fullPage: true });
  });

  test("商品列表 PLP", async ({ page }) => {
    await page.goto("/products");
    await settle(page);
    await expect(page).toHaveScreenshot("plp.png", { fullPage: true });
  });

  test("商品详情 PDP", async ({ page }) => {
    await page.goto("/products");
    await page.locator("a[href^='/products/']").first().waitFor({ timeout: 30_000 });
    const href = await page.locator("a[href^='/products/']").first().getAttribute("href");
    await page.goto(href ?? "/products");
    await settle(page);
    await expect(page).toHaveScreenshot("pdp.png", { fullPage: true });
  });

  test("购物车空态", async ({ page }) => {
    await page.goto("/cart");
    await settle(page);
    await expect(page).toHaveScreenshot("cart-empty.png", { fullPage: true });
  });

  test("搜索弹层", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    // 打开顶栏搜索浮层
    const searchTrigger = page.getByRole("button", { name: /search|搜索/i }).first();
    if (await searchTrigger.isVisible().catch(() => false)) {
      await searchTrigger.click();
      await page.waitForTimeout(600);
    }
    await expect(page).toHaveScreenshot("search-overlay.png", { fullPage: false });
  });
});
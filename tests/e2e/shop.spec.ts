import { test, expect } from "./fixtures";

/**
 * 购物全链路 E2E：浏览 → 详情 → 加购 → 结算 → 模拟支付 → 订单确认
 * 使用种子用户 user@example.com / User@123456
 */

test.describe("购物全链路", () => {
  // dev 模式下首次编译各路由较慢，放宽整体超时
  test.setTimeout(180_000);

  test("商品列表 → 详情 → 加购 → 结算 → 模拟支付 → 订单已支付", async ({ page }) => {
    // 登录
    await page.goto("/auth/login");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码").fill("User@123456");
    await page.getByRole("button", { name: /登录/ }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth/login"));

    // 接受 Cookie 横幅（固定底栏可能遮挡页面下方按钮）
    const consentBtn = page.getByRole("button", { name: /接受全部|仅必要/ }).first();
    if (await consentBtn.isVisible().catch(() => false)) {
      await consentBtn.click();
      await page.waitForTimeout(400);
    }

    // 首页 → 商品列表
    await page.goto("/products");
    await expect(page.locator("a[href^='/products/']").first()).toBeVisible({ timeout: 15_000 });

    // 打开第一个商品详情
    const firstCard = page.locator("a[href^='/products/']").first();
    await firstCard.click();
    await page.waitForURL(/\/products\/[a-z0-9-]+$/);
    await expect(page.getByRole("button", { name: /加入购物袋|加入购物车/ })).toBeVisible();

    // 加入购物袋
    await page.getByRole("button", { name: /加入购物袋|加入购物车/ }).click();

    // 进入购物车
    await page.goto("/cart");
    await expect(page.getByText(/购物袋|购物车/).first()).toBeVisible();

    // 结算
    await page.getByRole("link", { name: /去结算|结算/ }).click();
    await page.waitForURL(/\/checkout/);

    // 选择地址（种子数据已有默认地址）
    await expect(page.getByText(/收货地址/).first()).toBeVisible();
    await page.getByRole("button", { name: /提交订单|立即支付/ }).click();

    // 模拟支付页（dev 模式首次编译该路由可能较慢，放宽超时）
    await page.waitForURL(/\/checkout\/mock\//, { timeout: 60_000 });
    await expect(page.getByText(/模拟支付/).first()).toBeVisible();
    await page.getByRole("button", { name: /支付成功|模拟支付成功/ }).click();

    // 结果页 → 订单详情
    await page.waitForURL(/\/checkout\/result\?/, { timeout: 60_000 });
    await expect(page.getByText(/支付成功/).first()).toBeVisible();
    await page.getByRole("link", { name: /查看订单|订单详情/ }).click();

    // 订单详情显示已支付
    await page.waitForURL(/\/orders\//, { timeout: 60_000 });
    await expect(page.getByText("已支付").first()).toBeVisible({ timeout: 15_000 });
  });
});

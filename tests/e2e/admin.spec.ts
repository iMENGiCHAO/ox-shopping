import { test, expect } from "./fixtures";

/**
 * 管理端 E2E：登录 → 仪表盘 → 商品管理（创建/上架）
 */

test.describe("管理后台", () => {
  test("管理员登录并创建商品", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("邮箱").fill("admin@example.com");
    await page.getByLabel("密码").fill("Admin@123456");
    await page.getByRole("button", { name: /登录/ }).click();

    // 仪表盘
    await page.waitForURL(/\/admin$/);
    await expect(page.getByText(/销售额|销售趋势|今日销售额/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/最近订单/)).toBeVisible();

    // 商品管理（侧边栏内链接，避免与页面其他“商品”链接冲突）
    await page.getByRole("complementary").getByRole("link", { name: "商品" }).click();
    await page.waitForURL(/\/admin\/products/);
    await expect(page.getByRole("button", { name: /新增商品/ })).toBeVisible();

    // 新增商品（草稿）——所有表单字段限定在弹窗内（避免与背后表格的元素冲突）
    await page.getByRole("button", { name: /新增商品/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("商品名称").fill(`E2E 测试商品 ${Date.now()}`);
    await dialog.getByLabel("SKU").fill(`E2E-${Date.now()}`);
    await dialog.getByLabel("价格").fill("66.6");
    await dialog.getByLabel("库存").fill("10");
    // 分类为必填项：表单中第一个下拉框；状态切到“上架”便于在默认列表可见
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /手机数码/ }).first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "上架" }).click();
    await dialog.getByRole("button", { name: /创建商品|保存修改/ }).click();
    await expect(page.getByText(/商品已创建|已保存/)).toBeVisible({ timeout: 10_000 });

    // 列表可见
    await expect(page.getByText(/E2E 测试商品/).first()).toBeVisible();
  });

  test("未登录访问管理端被重定向", async ({ page }) => {
    await page.goto("/admin/products");
    await page.waitForURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: /MENG Shop|星辰商城/ })).toBeVisible();
  });
});

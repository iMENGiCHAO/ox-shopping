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
    await expect(page.getByRole("button", { name: /新建商品|新增商品/ })).toBeVisible();

    // 新建商品（草稿）——所有表单字段限定在弹窗内（避免与背后表格的元素冲突）
    await page.getByRole("button", { name: /新建商品|新增商品/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("商品名称").fill(`E2E 测试商品 ${Date.now()}`);
    await dialog.getByLabel("SKU").fill(`E2E-${Date.now()}`);
    await dialog.getByLabel("价格").fill("66.6");
    await dialog.getByLabel("库存").fill("10");
    // 分类为必填项：表单中第一个下拉框（种子分类为 Ox Collection / Ox Essentials Collection
    // —— prisma/demo-catalog.ts 已中性化为虚构品牌，勿再断言旧第三方商标名）
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /Ox Collection|Ox Essentials/ }).first().click();
    // 状态保持默认「草稿」（不切「上架」）：避免测试商品进入前台商城目录污染生产数据
    // 后台列表默认「所有状态」，草稿也会出现在列表中，不影响“列表可见”断言
    await dialog.getByRole("button", { name: /创建商品|保存修改/ }).click();
    await expect(page.getByText(/商品已创建|已保存/)).toBeVisible({ timeout: 10_000 });

    // 列表可见（草稿亦显示在「所有状态」列表中）
    await expect(page.getByText(/E2E 测试商品/).first()).toBeVisible();
  });

  test("未登录访问管理端被重定向", async ({ page }) => {
    await page.goto("/admin/products");
    await page.waitForURL(/\/admin\/login/);
    // 站名可由品牌/数据库设置覆盖，登录门禁本身只应验证管理登录壳与表单。
    await expect(page.getByRole("heading", { name: /管理|Admin/i })).toBeVisible();
    await expect(page.getByLabel("邮箱")).toBeVisible();
    await expect(page.getByLabel("密码")).toBeVisible();
  });
});

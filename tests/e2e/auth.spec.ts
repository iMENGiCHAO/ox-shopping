import { test, expect } from "./fixtures";

/**
 * 认证流程 E2E：注册 → 登出 → 登录 → 个人中心
 * 依赖：种子数据库 + 模拟支付（.env PAYMENT_MODE=mock）
 */

const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

test.describe("注册与登录", () => {
  test("新用户注册后自动登录并可访问个人中心", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/auth/register");
    await expect(page.getByRole("button", { name: /^注册$/ })).toBeVisible();

    await page.getByLabel("姓名").fill("E2E 测试用户");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码", { exact: true }).fill("User@123456");
    await page.getByRole("button", { name: /创建账号|注册/ }).click();

    // 注册成功进入首页，头部出现账户入口
    await page.waitForURL(/\/$|(?<!auth\/register)$/);
    await expect(
      page
        .locator("header")
        .getByText(/个人中心|账户|E2E 测试用户/)
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    });

    // 访问个人中心（邮箱以只读输入框展示）
    await page.goto("/account/profile");
    await expect(page.getByLabel(/邮箱/).first()).toHaveValue(email);

    // 登出
    await page
      .locator("header")
      .getByRole("button", { name: /账户|E2E 测试用户/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /退出登录/ }).click();
    await expect(page.getByText("登录").first()).toBeVisible({ timeout: 10_000 });
  });

  test("种子用户登录", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码").fill("User@123456");
    await page.getByRole("button", { name: /登录/ }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
    await expect(page.getByText(/测试用户|个人中心/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("错误密码提示", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("邮箱").fill("user@example.com");
    await page.getByLabel("密码").fill("WrongPass@1");
    await page.getByRole("button", { name: /登录/ }).click();
    await expect(page.getByText(/邮箱或密码错误|账号已被禁用/)).toBeVisible({ timeout: 10_000 });
  });
});

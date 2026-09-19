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

    // 原站形态：注册页是 4 个「只有 placeholder」的框（First/Last name、E-mail、Password）
    await page.getByPlaceholder("名", { exact: true }).fill("E2E");
    await page.getByPlaceholder("姓", { exact: true }).fill("测试用户");
    await page.getByPlaceholder("邮箱", { exact: true }).fill(email);
    await page.getByPlaceholder("密码", { exact: true }).fill("User@123456");
    await page.getByRole("button", { name: /创建账号|注册/ }).click();

    // 注册成功自动登录，跳转首页；头部账户入口为单链接（非下拉菜单）
    await page.waitForURL((url) => !url.pathname.includes("/auth/register"));
    await expect(page.locator("header").getByRole("link", { name: /账户/ }).first()).toBeVisible({
      timeout: 15_000,
    });

    // 访问个人中心（邮箱以只读输入框展示）
    await page.goto("/account/profile");
    await expect(page.getByLabel(/邮箱/).first()).toHaveValue(email);

    // 登出：个人中心左侧导航的「退出登录」按钮
    await page.getByRole("button", { name: /退出登录/ }).click();
    await expect(page.locator("header").getByRole("link", { name: /登录/ }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("种子用户登录", async ({ page }) => {
    await page.goto("/auth/login");
    // 原站形态：字段名是框内 placeholder（灰字），无框外 label
    await page.getByPlaceholder("邮箱", { exact: true }).fill("user@example.com");
    await page.getByPlaceholder("密码", { exact: true }).fill("User@123456");
    await page.getByRole("button", { name: /登录/ }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth/login"));
    // 头部账户入口为单链接「账户」（不显示用户名，名字在个人中心 /account 内）
    await expect(page.locator("header").getByRole("link", { name: /账户/ }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("错误密码提示", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByPlaceholder("邮箱", { exact: true }).fill("user@example.com");
    await page.getByPlaceholder("密码", { exact: true }).fill("WrongPass@1");
    await page.getByRole("button", { name: /登录/ }).click();
    // 接口错误文案目前为服务端固定英文（未做 API 层本地化），中英都接受
    await expect(
      page.getByText(/Incorrect email or password|邮箱或密码错误|账号已被禁用|disabled/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

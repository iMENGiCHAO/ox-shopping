import { test, expect } from "./fixtures";

/**
 * 管理后台物流方式 E2E：友好创建流程（对话框 + 快速模板 + 校验）+ 编辑 + 启停 + 删除。
 * 全程使用唯一代号/名称，末尾清理，不污染种子数据。
 */

test.describe("管理后台 — 物流方式", () => {
  test("创建/编辑/启停/删除物流方式全流程", async ({ page }) => {
    const ts = Date.now();
    const name = `E2E 物流 ${ts}`;
    const nameEn = `E2E Shipping ${ts}`;
    const code = `e2e-ship-${ts}`;

    // 登录
    await page.goto("/admin/login");
    await page.getByLabel("邮箱").fill("admin@example.com");
    await page.getByLabel("密码").fill("Admin@123456");
    await page.getByRole("button", { name: /登录/ }).click();
    await page.waitForURL(/\/admin$/);

    // 物流方式页
    await page.goto("/admin/shipping");
    await expect(page.getByRole("heading", { name: "物流方式" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/前台结账页按「排序」/)).toBeVisible();

    // ── 创建：打开对话框，套用模板后修改 ──
    await page.getByRole("button", { name: "新建物流方式" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "新建物流方式" })).toBeVisible();
    // 快速模板可见，默认套用「标准物流」
    await expect(dialog.getByRole("group", { name: "快速模板" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /标准物流/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 顾客结账页预览随表单联动
    await expect(dialog.getByLabel("结账页预览")).toBeVisible();

    await dialog.getByLabel("显示名（中文）").fill(name);
    await dialog.getByLabel("英文名").fill(nameEn);
    // 代号随英文名自动生成后，显式改为唯一代号
    await dialog.getByLabel("代号").fill(code);
    await dialog.getByLabel("基础运费").fill("12.34");
    await dialog.getByLabel("免邮门槛").fill("88");
    await dialog.getByLabel("送达时间（中文）").fill("E2E 3-5 个工作日");
    // 预览展示运费与免邮提示
    await expect(dialog.getByLabel("结账页预览")).toContainText("订单满 $88.00 免运费");

    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page.getByText("物流方式已创建")).toBeVisible({ timeout: 10_000 });

    // 列表可见新行
    const row = page.getByRole("row").filter({ hasText: code });
    await expect(row).toBeVisible();
    await expect(row).toContainText("$12.34");
    await expect(row).toContainText("满 $88.00");

    // ── 编辑：改运费 ──
    // 创建对话框关闭动画期间其 overlay 会遮挡列表按钮（click 等 actionable 超时）：
    // 先等 dialog 彻底卸载再操作行内按钮
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row.getByRole("button", { name: `编辑 ${name}` }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByRole("heading", { name: `编辑物流方式 — ${name}` })).toBeVisible();
    // 编辑模式代号只读（视觉锁定 + 属性断言）
    await expect(editDialog.getByLabel("代号")).toHaveAttribute("readonly", "");
    await editDialog.getByLabel("基础运费").fill("9.99");
    await editDialog.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("物流方式已保存")).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText("$9.99");

    // ── 启停：开关即时生效 ──
    // 同「编辑」：保存后对话框关闭动画期间 overlay 仍在，先等它卸载再点开关
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row.getByRole("switch", { name: `停用 ${name}` }).click();
    await expect(page.getByText(`「${name}」已停用，前台结账页不再显示`)).toBeVisible({
      timeout: 10_000,
    });
    await row.getByRole("switch", { name: `启用 ${name}` }).click();
    await expect(page.getByText(`「${name}」已启用`)).toBeVisible({ timeout: 10_000 });

    // ── 删除：确认弹窗（未被订单引用 → 物理删除）──
    await row.getByRole("button", { name: `删除 ${name}` }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByRole("heading", { name: "删除物流方式" })).toBeVisible();
    await expect(confirm).toContainText("尚未被任何订单使用");
    await confirm.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText(`「${name}」已删除`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("row").filter({ hasText: code })).toHaveCount(0);
  });

  test("创建校验：必填与代号查重的行内错误", async ({ page }) => {
    // 登录
    await page.goto("/admin/login");
    await page.getByLabel("邮箱").fill("admin@example.com");
    await page.getByLabel("密码").fill("Admin@123456");
    await page.getByRole("button", { name: /登录/ }).click();
    await page.waitForURL(/\/admin$/);
    await page.goto("/admin/shipping");

    await page.getByRole("button", { name: "新建物流方式" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "新建物流方式" })).toBeVisible();

    // 清空必填显示名提交 → 行内错误
    await dialog.getByLabel("显示名（中文）").fill("");
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await expect(dialog.getByText("请填写显示名（顾客在结账页看到）").first()).toBeVisible();

    // 代号占用种子 standard → 行内查重错误
    await dialog.getByLabel("显示名（中文）").fill("重复代号测试");
    await dialog.getByLabel("代号").fill("standard");
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await expect(dialog.getByText("该代号已被其他物流方式使用").first()).toBeVisible();

    // 对话框不关闭（未提交成功）
    await expect(dialog.getByRole("heading", { name: "新建物流方式" })).toBeVisible();
  });
});

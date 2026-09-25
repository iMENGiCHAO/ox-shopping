import { test, expect } from "./fixtures";

/**
 * 购物全链路 E2E：浏览 → 详情 → 加购 → 结算 → 模拟支付 → 订单确认
 * 使用种子用户 user@example.com / User@123456
 */

test.describe("购物全链路", () => {
  // dev 模式下首次编译各路由较慢，放宽整体超时
  // 360s：慢速机械卷上全链路实测 ~2.5m（订单页冷编译 21s）+ 数据自还原段
  // ~40s（admin login/列表/PATCH 各步 4-21s），180s 余量不足会打断自还原
  test.setTimeout(360_000);

  test("商品列表 → 详情 → 加购 → 结算 → 模拟支付 → 订单已支付", async ({ page }) => {
    // 登录
    await page.goto("/auth/login");
    // 原站形态：字段名是框内 placeholder（灰字），无框外 label
    await page.getByPlaceholder("邮箱", { exact: true }).fill("user@example.com");
    await page.getByPlaceholder("密码", { exact: true }).fill("User@123456");
    await page.getByRole("button", { name: /登录/ }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth/login"));

    // 接受 Cookie 横幅（固定底栏可能遮挡页面下方按钮）
    const consentBtn = page.getByRole("button", { name: /接受全部|仅必要/ }).first();
    if (await consentBtn.isVisible().catch(() => false)) {
      await consentBtn.click();
      await page.waitForTimeout(400);
    }

    // 商品列表页 → 固定测试商品
    // 注意：`/products` 与原站一致是 All collections 索引页（无商品卡），
    // 商品网格在集合页 `/collections/<slug>`；中文界面下内部链接带 /zh 前缀，
    // 因此用 href*= 而不是 href^=。
    await page.goto("/collections/ox-essentials-collection");
    await expect(page.locator("a[href*='/products/']").first()).toBeVisible({ timeout: 30_000 });

    // 打开固定的测试商品（不再用"第一张卡"——E2E 反复购买会把它买到售罄，
    // 使 PLP 第一张卡易主、PDP 视觉基线整页漂移；固定商品 + 跑完还原库存，数据零侵蚀）
    const testCard = page.locator("a[href*='/products/ox-kids-constellation-tee']").first();
    await testCard.waitFor({ timeout: 30_000 });
    await testCard.click();
    // 允许 /zh 语言前缀
    await page.waitForURL(/\/products\/[a-z0-9-]+\/?$/);
    await expect(page.getByRole("button", { name: /加入购物袋|加入购物车/ })).toBeVisible();

    // 加入购物袋
    await page.getByRole("button", { name: /加入购物袋|加入购物车/ }).click();

    // 进入购物车
    await page.goto("/cart");
    await expect(page.getByText(/购物袋|购物车/).first()).toBeVisible();

    // 结算
    await page.getByRole("link", { name: /去结算|结算/ }).click();
    await page.waitForURL(/\/checkout/);

    // 结算：原站形态的**多步**结账（信息 → 运费 → 支付 → 确认）
    // 登录用户邮箱已自动带入；地址表单需显式填写（已存地址要手动「一键带入」，
    // E2E 统一走内联表单，行为与游客一致、不受种子地址字段完整性影响）
    await expect(page.getByText(/收货地址/).first()).toBeVisible();
    await page.getByPlaceholder("名", { exact: true }).fill("E2E");
    await page.getByPlaceholder("姓", { exact: true }).fill("Buyer");
    await page.getByPlaceholder("详细地址").fill("123 Test St");
    await page.getByPlaceholder("城市").fill("San Francisco");
    await page.getByPlaceholder("邮政编码").fill("94105");
    // 第二个 select 是「省/州」（第一个是国家/地区），美国地址为必填
    await page.locator("select").nth(1).selectOption({ index: 1 });
    await page.getByRole("button", { name: /继续填写配送信息/ }).click();
    await expect(page.getByText(/配送方式/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /继续支付/ }).click();
    await expect(page.getByText(/支付方式/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /继续确认订单/ }).click();
    await page.getByRole("button", { name: /提交订单/ }).click();

    // 模拟支付页（dev 模式首次编译该路由可能较慢，放宽超时）
    await page.waitForURL(/\/checkout\/mock\//, { timeout: 60_000 });
    await page
      .getByRole("button", { name: /Mock payment successful|模拟支付成功|支付成功/ })
      .click();

    // 结果页 → 订单详情
    await page.waitForURL(/\/checkout\/result\?/, { timeout: 60_000 });
    await expect(page.getByText(/支付成功|Payment received/).first()).toBeVisible();
    await page.getByRole("link", { name: /查看订单|订单详情|View order/ }).click();

    // 订单详情显示已支付
    await page.waitForURL(/\/orders\//, { timeout: 60_000 });
    await expect(page.getByText(/已支付|Paid/).first()).toBeVisible({ timeout: 15_000 });

    // 数据自还原：测试商品库存补回固定值（PDP/PLP 渲染与视觉基线稳定的关键）。
    // 覆盖当前页面会话为 admin 后走 admin API；测试已断言完毕，会话覆盖无副作用。
    await page.evaluate(async () => {
      await fetch("/api/auth/csrf");
      const csrf = () =>
        document.cookie
          .split("; ")
          .find((c) => /csrf/i.test(c))
          ?.split("=")[1] ?? "";
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "Admin@123456",
          scope: "admin",
        }),
      });
      const list = (await fetch("/api/admin/products?page=1&pageSize=50").then((r) =>
        r.json(),
      )) as { data?: { id: string; slug: string }[] };
      const target = (list?.data ?? []).find((p) => p.slug === "ox-kids-constellation-tee");
      if (target) {
        await fetch(`/api/admin/products/${target.id}/stock`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
          body: JSON.stringify({ stock: 50 }),
        });
      }
    });
  });

  test("游客持订单 token 可直接打开订单详情，不被父 layout 登录门禁拦截", async ({ page }) => {
    await page.goto("/");

    const created = await page.evaluate(async () => {
      await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf =
        document.cookie
          .split("; ")
          .find((c) => c.startsWith("csrf_token="))
          ?.split("=")[1] ?? "";
      const productsResponse = await fetch("/api/products?inStock=true&pageSize=100");
      const productsBody = (await productsResponse.json()) as {
        data?: Array<{ id: string; slug?: string; attributes?: unknown[] }>;
      };
      const product = productsBody.data?.find(
        (item) => item.slug === "ox-remove-before-flight-keychain",
      );
      if (!product || (product.attributes?.length ?? 0) > 0) {
        throw new Error("guest-order E2E fixture product unavailable");
      }

      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": decodeURIComponent(csrf) },
        body: JSON.stringify({
          contactEmail: "guest-order-e2e@example.com",
          items: [{ productId: product.id, quantity: 1 }],
          shippingAddress: {
            country: "US",
            firstName: "Guest",
            lastName: "Buyer",
            line1: "123 Test St",
            city: "San Francisco",
            state: "CA",
            postalCode: "94105",
          },
          shippingMethod: "standard",
          channelCode: "mock",
        }),
      });
      const orderBody = (await orderResponse.json()) as {
        data?: { order?: { orderNumber?: string }; orderToken?: string | null };
        error?: { message?: string };
      };
      return {
        status: orderResponse.status,
        orderNumber: orderBody.data?.order?.orderNumber ?? "",
        orderToken: orderBody.data?.orderToken ?? "",
        error: orderBody.error?.message ?? "",
      };
    });

    expect(created.status, created.error).toBe(200);
    expect(created.orderNumber).toBeTruthy();
    expect(created.orderToken).toBeTruthy();

    await page.goto(
      `/orders/${encodeURIComponent(created.orderNumber)}?token=${encodeURIComponent(created.orderToken)}`,
    );
    await expect(page).toHaveURL(new RegExp(`/orders/${created.orderNumber}\\?`));
    await expect(page.getByRole("heading", { name: /订单详情|Order detail/i })).toBeVisible();
    await expect(page.getByText(new RegExp(created.orderNumber)).first()).toBeVisible();

    // 取消未付款游客单会回补库存，避免该 E2E 改变后续视觉/库存基线。
    const cancelled = await page.evaluate(async ({ orderNumber, orderToken }) => {
      const csrf =
        document.cookie
          .split("; ")
          .find((c) => c.startsWith("csrf_token="))
          ?.split("=")[1] ?? "";
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}/cancel`, {
        method: "POST",
        headers: {
          "x-csrf-token": decodeURIComponent(csrf),
          "x-order-token": orderToken,
        },
      });
      return response.status;
    }, created);
    expect(cancelled).toBe(200);
  });

  test("访客访问 /checkout 后快速导航不产生未捕获异常", async ({ page }) => {
    // 回归：访客 401 + addrPromise 浮动拒绝曾以 pageerror 打到导航后的下一页
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/checkout", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_200);
    await page.goto("/pages/faqs", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3_000);

    expect(pageErrors).toEqual([]);
  });
});

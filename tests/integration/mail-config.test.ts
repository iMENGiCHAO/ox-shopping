import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getMailStatus } from "@/lib/mail";
import {
  getMailConfigForAdmin,
  getMailRuntimeConfig,
  invalidateMailConfigCache,
  saveMailConfig,
} from "@/server/services/mail-config.service";

/**
 * 邮件通道「后台可配」的关键不变量。
 *
 * 背景：此前通道完全由 `.env` 决定，后台只能看状态不能改 —— 典型伪功能。
 * 现在配置落库、密钥加密、后台可编辑。本文件锁定四条不变量：
 *   1. 保存后运行时配置立即生效；
 *   2. **密钥加密落库**：库里的密文与后台视图都不得出现明文；
 *   3. 密钥字段留空 = 保留原值（既不回显也不清空）；
 *   4. 删掉后台配置 → 回落环境变量（既有部署升级后行为不变）。
 */

const KEY = "mail_config";

afterAll(async () => {
  await prisma.siteSetting.deleteMany({ where: { key: KEY } });
  invalidateMailConfigCache();
});

describe("邮件通道：后台配置", () => {
  it("保存 SMTP 配置后即时生效，且密钥加密、视图脱敏", async () => {
    await saveMailConfig({
      provider: "smtp",
      from: "测试商城 <no-reply@test.local>",
      smtpHost: "smtp.test.local",
      smtpPort: 2525,
      smtpUser: "ops@test.local",
      smtpPass: "super-secret-pass",
    });

    const cfg = await getMailRuntimeConfig();
    expect(cfg.provider).toBe("smtp");
    expect(cfg.smtp.host).toBe("smtp.test.local");
    expect(cfg.smtp.port).toBe(2525);
    expect(cfg.smtp.pass).toBe("super-secret-pass");
    expect(cfg.source).toBe("db");

    // 落库的是密文：库里不得出现明文密码
    const row = await prisma.siteSetting.findUniqueOrThrow({ where: { key: KEY } });
    expect(JSON.stringify(row.value)).not.toContain("super-secret-pass");

    // 后台视图同样只回「是否已配置」
    const admin = await getMailConfigForAdmin();
    expect(admin.hasSmtpPass).toBe(true);
    expect(JSON.stringify(admin)).not.toContain("super-secret-pass");

    // 状态接口反映「可真正发信」
    const status = await getMailStatus();
    expect(status.provider).toBe("smtp");
    expect(status.effective).toBe("smtp");
    expect(status.deliverable).toBe(true);
    expect(status.source).toBe("db");
  });

  it("密钥字段留空 = 保留原值（不回显也不清空）", async () => {
    await saveMailConfig({
      provider: "smtp",
      smtpHost: "smtp.test.local",
      smtpPort: 2525,
      // 刻意不传 smtpPass
    });
    const cfg = await getMailRuntimeConfig();
    expect(cfg.smtp.pass).toBe("super-secret-pass");
    expect((await getMailConfigForAdmin()).hasSmtpPass).toBe(true);
  });

  it("切换到 resend：检查项随通道变化，缺 key 时降级并告警", async () => {
    await saveMailConfig({ provider: "resend" });
    const status = await getMailStatus();
    expect(status.provider).toBe("resend");
    expect(status.checks.some((c) => c.key === "resendApiKey")).toBe(true);
    expect(status.checks.some((c) => c.key === "smtpHost")).toBe(false);
    // env 也没有 key 时必须降级为 console 并给出后果说明
    if (!status.deliverable) expect(status.warning).toBeTruthy();
  });

  it("删除后台配置后回落环境变量（向后兼容既有部署）", async () => {
    await prisma.siteSetting.deleteMany({ where: { key: KEY } });
    invalidateMailConfigCache();
    const cfg = await getMailRuntimeConfig();
    expect(cfg.source).toBe("env");
    expect(cfg.provider).toBe(process.env.MAIL_PROVIDER ?? "console");
  });
});

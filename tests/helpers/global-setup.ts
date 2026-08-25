import { execSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

/**
 * 全局初始化（所有 vitest 测试前执行一次）：
 * 1. 加载测试环境变量
 * 2. 若配置了 TEST_DATABASE_URL，则执行 prisma db push 同步测试库结构
 *    （集成测试依赖；未配置时单元测试照常运行）
 */
export default function globalSetup() {
  config({ path: path.resolve(process.cwd(), ".env.test"), override: false });
  config({ path: path.resolve(process.cwd(), ".env"), override: false });

  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl || process.env.SKIP_DB_PUSH === "true") {
    // eslint-disable-next-line no-console
    console.log("[global-setup] 未检测到数据库配置，跳过 prisma db push（仅运行单元测试）");
    return;
  }
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    // eslint-disable-next-line no-console
    console.log("[global-setup] 测试数据库结构已同步");
    // 幂等种子数据（测试账号/商品/优惠券）
    execSync("npx tsx prisma/seed.ts", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    // eslint-disable-next-line no-console
    console.log("[global-setup] 测试种子数据已写入");
  } catch (err) {
    // 数据库不可用时不阻断单元测试；集成测试会自行失败并给出明确信息
    // eslint-disable-next-line no-console
    console.warn(
      "[global-setup] 测试数据库初始化失败（数据库可能未启动）：",
      String(err).slice(0, 300),
    );
  }
}

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
    /* db push **之前**先做数据归一：测试库由 db push 管理、没有迁移记录，
       而 `commission_rules.tierLevel` 已改为 NOT NULL（0=通用）——
       库里若还有 NULL，db push 会直接拒绝执行，连带 seed 也不跑，
       整批集成测试连锁失败（P0-1 相关）。 */
    try {
      execSync("npx prisma db execute --file prisma/sql/pre-push-normalize.sql", {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: dbUrl },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[global-setup] 预归一失败（首次建库可忽略）：", String(err).slice(0, 200));
    }
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
    // eslint-disable-next-line no-console
    console.log("[global-setup] 测试数据库结构已同步");
    /* ⚠️ db push 会把 schema 表达不了的原始索引删掉 —— 尤其
       `withdraw_records_one_inflight_per_user`（一用户一笔在途提现的部分唯一索引）。
       不重建 = 并发提现保护在测试/CI 环境静默消失，而测试仍然全绿（P1-9）。 */
    try {
      execSync("npx prisma db execute --file prisma/sql/raw-indexes.sql", {
        stdio: "pipe",
        env: { ...process.env, DATABASE_URL: dbUrl },
      });
      // eslint-disable-next-line no-console
      console.log("[global-setup] 原始索引已重建（含提现并发保护）");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[global-setup] 原始索引重建失败：", String(err).slice(0, 200));
    }
    /* 清空上一轮遗留的业务数据（**仅测试库**）。
       为什么必须：集成测试不做清理，多轮累积（实测 25148 用户 / 1700 订单）
       后 cron 整轮任务（单事务内跑完：超时取消 → 清理 → 分销对账 → 业绩汇总）
       会对全表聚合并超过 vitest 的 60s 超时，表现为「与本轮改动无关的 cron
       用例突然失败」，定位成本极高。清库让数据规模恒定。
       安全：只有 URL 库名以 _test 结尾才执行（SQL 内还有第二道断言）。 */
    if (/_test(\?|$)/.test(dbUrl)) {
      try {
        execSync("npx prisma db execute --file prisma/sql/reset-test-data.sql", {
          stdio: "pipe",
          env: { ...process.env, DATABASE_URL: dbUrl },
        });
        // eslint-disable-next-line no-console
        console.log("[global-setup] 测试库业务数据已清空（避免多轮累积拖慢对账/汇总）");
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[global-setup] 测试库清空失败：", String(err).slice(0, 200));
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn("[global-setup] DATABASE_URL 不是 *_test 库，跳过清空（测试数据会累积到该库）");
    }

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

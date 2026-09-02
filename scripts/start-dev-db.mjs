/**
 * 一键启 dev PG (embedded-postgres，绕开 homebrew PG 16/17 在 macOS 15.7 的
 * pthread_main_np multithreaded 启动 bug)。
 *
 * 用法：
 *   node scripts/start-dev-db.mjs        # 后台启，留着不退出
 *   node scripts/start-dev-db.mjs --bg   # 启后 detach
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { existsSync, rmSync } from "node:fs";

const databaseDir = path.resolve(process.cwd(), ".pg-data");
const port = 5432;
const user = "postgres";
const password = "postgres";

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user,
  password,
  authMethod: "trust",
  persistent: true,
  initdbFlags: ["--no-locale", "--encoding=UTF8"],
  // 强制 C locale，避开 macOS launchd 启动时的 pthread_main_np 检查
  postgresFlags: [],
});

const isBg = process.argv.includes("--bg");
const isInit = process.argv.includes("--init") || !existsSync(path.join(databaseDir, "PG_VERSION"));

if (isInit) {
  if (existsSync(databaseDir)) {
    console.log(`[pg] 清空旧数据目录: ${databaseDir}`);
    rmSync(databaseDir, { recursive: true, force: true });
  }
  console.log(`[pg] initdb: ${databaseDir}`);
  await pg.initialise();
} else {
  console.log(`[pg] 复用数据目录: ${databaseDir}`);
}

console.log(`[pg] start at 127.0.0.1:${port} user=${user}`);
await pg.start();

// 等启动稳定
await new Promise((r) => setTimeout(r, 1500));

// 测一下
try {
  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  const r = await client.query("SELECT version()");
  console.log("[pg] OK:", r.rows[0].version);
  await client.end();
} catch (err) {
  console.error("[pg] 连接失败:", err.message);
  process.exit(1);
}

if (isBg) {
  console.log("[pg] 后台运行。Ctrl+C 退出。");
  // 保持进程活着
  setInterval(() => {}, 1 << 30);
} else {
  // 阻塞主线程
  await new Promise(() => {});
}

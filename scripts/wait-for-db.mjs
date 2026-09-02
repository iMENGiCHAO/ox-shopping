#!/usr/bin/env node
/**
 * 容器启动等待数据库就绪（零第三方依赖，TCP 探测）。
 * 用法：node scripts/wait-for-db.mjs [timeoutSeconds]
 * 环境：DATABASE_URL（必填）、DB_WAIT_SECONDS（可选，默认 60）
 */
import net from "node:net";
import process from "node:process";

function parseDbUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname) return null;
    return {
      host: u.hostname,
      port: Number(u.port || 5432),
    };
  } catch {
    return null;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryConnect(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(2000);
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.once("timeout", () => done(false));
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[wait-for-db] DATABASE_URL 未配置");
    process.exit(1);
  }
  const target = parseDbUrl(url);
  if (!target) {
    console.error("[wait-for-db] 无法解析 DATABASE_URL");
    process.exit(1);
  }

  const timeoutSeconds = Number(process.argv[2] ?? process.env.DB_WAIT_SECONDS ?? 60);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    if (await tryConnect(target.host, target.port)) {
      console.log(
        `[wait-for-db] 数据库就绪（${target.host}:${target.port}，第 ${attempt} 次尝试）`,
      );
      process.exit(0);
    }
    await wait(1000);
  }

  console.error(
    `[wait-for-db] 等待数据库超时（${timeoutSeconds}s）：${target.host}:${target.port}`,
  );
  process.exit(1);
}

main();

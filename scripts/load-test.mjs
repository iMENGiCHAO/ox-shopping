#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 轻量压测基线工具（零依赖）：
 *   node scripts/load-test.mjs <url> [concurrency] [durationSeconds]
 * 示例：
 *   node scripts/load-test.mjs http://localhost:3000/products 20 30
 * 输出 RPS / p50 / p95 / p99 / 错误数。仅用于本地/预发基线对比，
 * 勿对生产环境施压。
 */
import { readFileSync } from "node:fs";

const [, , url = "http://localhost:3000/", concArg, durArg] = process.argv;
const CONCURRENCY = Math.max(1, Number(concArg ?? 10));
const DURATION_S = Math.max(1, Number(durArg ?? 15));

// 带 cookie？支持 --cookie "a=b" 简易透传（可选）
let cookie = "";
const ci = process.argv.indexOf("--cookie");
if (ci > 0) cookie = process.argv[ci + 1] ?? "";

let stop = false;
const latencies = [];
let errors = 0;
let total = 0;

setTimeout(() => {
  stop = true;
}, DURATION_S * 1000);

async function worker() {
  while (!stop) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        headers: cookie ? { cookie } : {},
        redirect: "manual",
      });
      // 读掉 body 才算完整请求
      await res.arrayBuffer();
      const ms = performance.now() - t0;
      latencies.push(ms);
      total++;
      if (res.status >= 500) errors++;
    } catch {
      errors++;
      total++;
    }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

console.log(`目标 ${url} · 并发 ${CONCURRENCY} · 时长 ${DURATION_S}s`);
const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const elapsed = (Date.now() - started) / 1000;

console.log("──────── 结果 ────────");
console.log(`总请求: ${total} · 错误(5xx/网络): ${errors}`);
console.log(`RPS: ${(total / elapsed).toFixed(1)}`);
console.log(
  `延迟 p50=${pct(latencies, 50).toFixed(0)}ms · p95=${pct(latencies, 95).toFixed(0)}ms · p99=${pct(latencies, 99).toFixed(0)}ms`,
);

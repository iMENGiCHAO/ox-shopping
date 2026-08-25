#!/usr/bin/env node
/* eslint-disable no-console */
// 按规范化键名去重字典条目：同时识别 "Key": {...} 与 Key: {...} 两种风格，保留首个。
import { readFileSync, writeFileSync } from "node:fs";

const QUOTED = /^(\s*)("(?:[^"\\]|\\.)*")(: \{.*\}(?:,\s*)?)$/;
const BARE = /^(\s*)([A-Za-z_$][\w$]*)(: \{.*\}(?:,\s*)?)$/;

function norm(rawKey) {
  return rawKey.startsWith('"') ? JSON.parse(rawKey) : rawKey;
}

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, "utf8").split("\n");
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const line of lines) {
    const q = QUOTED.exec(line);
    if (q) {
      const key = norm(q[2]);
      if (seen.has(key)) {
        removed++;
        continue;
      }
      seen.add(key);
      out.push(line);
      continue;
    }
    const b = BARE.exec(line);
    if (b && !/^(en|zh|Dict|Lang)$/.test(b[2])) {
      const key = b[2];
      if (seen.has(key)) {
        removed++;
        continue;
      }
      seen.add(key);
      out.push(line);
      continue;
    }
    out.push(line);
  }
  if (removed) {
    writeFileSync(file, out.join("\n"));
    console.log(`${file}: 移除重复 ${removed} 条`);
  } else {
    console.log(`${file}: 无重复`);
  }
}

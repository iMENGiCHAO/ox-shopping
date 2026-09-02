#!/usr/bin/env bash
# stop-dev.sh — 强杀 next dev 父子进程（沙箱内 lsof 不可用，用 ps + nc）
#
# 用法：bash scripts/stop-dev.sh
# 作用：清掉 next dev 父进程 + next-server 子进程（避免孤儿占端口）

set -e

PIDS=$(ps -ef | grep -E "next dev|next-server|next.*compiler" | grep -v grep | awk '{print $2}' | tr '\n' ' ')

if [ -z "$PIDS" ]; then
  echo "✅ 没有 next dev 进程在跑"
  if nc -z localhost 3000 2>/dev/null; then
    echo "⚠️  端口 3000 仍被占用，但不属于 next dev 进程，请手动检查"
    exit 1
  fi
  exit 0
fi

echo "🔪 杀掉 PIDs: $PIDS"
kill -9 $PIDS 2>/dev/null || true

sleep 3

if nc -z localhost 3000 2>/dev/null; then
  echo "❌ 端口 3000 仍被占用，请检查："
  ps -ef | grep -E "3000|next" | grep -v grep | head -5
  exit 1
fi

echo "✅ 端口 3000 已释放"

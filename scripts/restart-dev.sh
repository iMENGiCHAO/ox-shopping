#!/usr/bin/env bash
# restart-dev.sh — Prisma 重新 generate + 重启 dev server
#
# 用法：bash scripts/restart-dev.sh
# 作用：解决"stale Prisma client"问题（schema 改了但 dev 仍用旧 client）
# 流程：杀 dev → prisma generate → 启 dev

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🛑 Step 1: 杀掉旧 dev 进程..."
bash "$SCRIPT_DIR/stop-dev.sh"

echo ""
echo "🔄 Step 2: 重新生成 Prisma client..."
node node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js generate

echo ""
echo "🚀 Step 3: 启动新 dev server..."
PORT=3000 nohup npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
echo "   dev PID: $DEV_PID"

# 等启动
echo "⏳ 等待 ready..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 2
  if nc -z localhost 3000 2>/dev/null; then
    echo "✅ dev server 已启动 (PID $DEV_PID)"
    echo "   日志: tail -f /tmp/next-dev.log"
    exit 0
  fi
  echo "   ...still waiting ($((i*2))s)"
done

echo "❌ 30 秒内 dev 未启动，请查看 /tmp/next-dev.log"
exit 1

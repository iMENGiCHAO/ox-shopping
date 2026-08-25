#!/usr/bin/env bash
# 基线迁移收尾：把 init 迁移标记为已应用（不改动任何数据）。
# 仅需执行一次；要求数据库可连通。
set -euo pipefail
cd "$(dirname "$0")/.."
npx prisma migrate resolve --applied 000000000000_init
echo "✓ 基线迁移已登记。此后生产结构变更一律使用 npm run db:deploy（prisma migrate deploy）。"

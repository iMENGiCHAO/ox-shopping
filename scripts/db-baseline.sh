#!/usr/bin/env bash
# 迁移基线收尾（仅需执行一次，要求数据库可连通）：
# 1. db push 同步缺失的结构（如 payment_logs）
# 2. 把两个基线迁移标记为已应用（不重复执行、不动数据）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ 同步缺失结构 (prisma db push)"
npx prisma db push --skip-generate

echo "→ 登记基线迁移"
npx prisma migrate resolve --applied 000000000000_init
npx prisma migrate resolve --applied 000000000001_payment_log

echo "✓ 基线完成。此后生产结构变更一律：npx prisma migrate dev --name <change> 生成迁移 → npm run db:deploy 应用。"

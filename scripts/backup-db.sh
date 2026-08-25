#!/usr/bin/env bash
# 数据库逻辑备份：pg_dump 自定义格式 + gzip，本地保留 14 天。
# 生产建议挂 cron（宿主机或 CI）：
#   0 3 * * * /path/to/ecommerce/scripts/backup-db.sh >> /var/log/ecommerce-backup.log 2>&1
# 更稳妥的方案：由托管数据库（RDS/Cloud SQL）的自动快照兜底。
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

# 读取 .env 的 DATABASE_URL（不覆盖已有环境变量）
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
  export DATABASE_URL
fi
[[ -n "${DATABASE_URL:-}" ]] || { echo "✗ 未找到 DATABASE_URL"; exit 1; }

PG_DUMP="$(command -v pg_dump || echo /usr/local/opt/postgresql@17/bin/pg_dump)"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/ecommerce-$STAMP.dump"

echo "→ dumping to $OUT"
"$PG_DUMP" --format=custom --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
gzip -f "$OUT"

# 保留策略
find "$BACKUP_DIR" -name 'ecommerce-*.dump.gz' -mtime +"$RETAIN_DAYS" -delete

LATEST=$(ls -t "$BACKUP_DIR"/ecommerce-*.dump.gz | head -1)
SIZE=$(du -h "$LATEST" | cut -f1)
echo "✓ 备份完成：$LATEST ($SIZE)，保留 ${RETAIN_DAYS} 天"
echo "  恢复：pg_restore --clean --if-exists -d \$DATABASE_URL $LATEST"

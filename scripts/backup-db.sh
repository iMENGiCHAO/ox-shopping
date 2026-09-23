#!/usr/bin/env bash
# PostgreSQL 自定义格式备份 + 外层 gzip + SHA-256；只生成备份，不修改数据库。
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env | tail -1)"
  DATABASE_URL="${DATABASE_URL%\"}"; DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="${DATABASE_URL%\'}"; DATABASE_URL="${DATABASE_URL#\'}"
  export DATABASE_URL
fi
[[ -n "${DATABASE_URL:-}" ]] || { echo "✗ 未找到 DATABASE_URL（环境变量或项目根 .env）" >&2; exit 1; }
[[ "$RETAIN_DAYS" =~ ^[0-9]+$ ]] || { echo "✗ RETAIN_DAYS 必须是非负整数" >&2; exit 1; }

PG_DUMP="${PG_DUMP:-$(command -v pg_dump || true)}"
[[ -n "$PG_DUMP" && -x "$PG_DUMP" ]] || {
  echo "✗ 找不到 pg_dump；请安装与数据库大版本兼容的 PostgreSQL client 或设置 PG_DUMP" >&2
  exit 1
}

# Prisma URLs carry `?schema=public`, which libpq/pg_dump rejects as an unknown
# URI query parameter. Keep credentials/host/db intact and remove only Prisma's
# schema selector before handing the URL to native PostgreSQL tools.
normalize_pg_url() {
  DATABASE_URL="$1" python3 - <<'PY'
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
u = urlsplit(os.environ["DATABASE_URL"])
query = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != "schema"]
print(urlunsplit((u.scheme, u.netloc, u.path, urlencode(query), u.fragment)))
PY
}
PG_DUMP_URL="$(normalize_pg_url "$DATABASE_URL")"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_DIR/ecommerce-$STAMP.dump.gz"
PARTIAL="$FINAL.partial"
CHECKSUM="$FINAL.sha256"
GZ_TMP="$FINAL.tmp"
trap 'rm -f "$PARTIAL" "$GZ_TMP"' EXIT

echo "→ 创建 PostgreSQL 自定义格式备份"
"$PG_DUMP" --format=custom --no-owner --no-privileges --file="$PARTIAL" "$PG_DUMP_URL"
# Compress to a separately named temp file, then atomically publish FINAL.
gzip -c "$PARTIAL" > "$GZ_TMP"
[[ -s "$GZ_TMP" ]] || { echo "✗ gzip 输出为空，备份未生成" >&2; exit 1; }
mv "$GZ_TMP" "$FINAL"
rm -f "$PARTIAL"
SHA256_CMD="sha256sum"
command -v sha256sum >/dev/null 2>&1 || SHA_CMD="shasum"
[[ -n "$SHA_CMD" ]] || { echo "✗ 找不到 sha256sum 或 shasum" >&2; exit 1; }
(
  cd "$BACKUP_DIR"
  if [[ -n "$SHA_CMD" ]]; then
    shasum -a 256 "$(basename "$FINAL")" > "$(basename "$CHECKSUM")"
  else
    sha256sum "$(basename "$FINAL")" > "$(basename "$CHECKSUM")"
  fi
)

find "$BACKUP_DIR" -type f \( -name 'ecommerce-*.dump.gz.partial' -o -name 'ecommerce-*.dump.gz' -o -name 'ecommerce-*.dump.gz.sha256' \) -mtime "+$RETAIN_DAYS" -delete

SIZE="$(du -h "$FINAL" | awk '{print $1}')"
echo "✓ 备份完成：$FINAL ($SIZE)"
echo "  校验：cd '$BACKUP_DIR' && ${SHA_CMD:-sha256sum} ${SHA_CMD:+-a 256} -c '$(basename "$CHECKSUM")'"
echo "  恢复演练必须使用 scripts/restore-db.sh，并设置 RESTORE_CONFIRM=restore"

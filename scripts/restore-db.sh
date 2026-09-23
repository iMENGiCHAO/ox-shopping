#!/usr/bin/env bash
# 从 backup-db.sh 生成的归档恢复数据库；默认拒绝执行，必须显式确认。
# 推荐先恢复到临时数据库完成恢复演练，再安排生产切换。
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

BACKUP_FILE="${1:-}"
RESTORE_URL="${RESTORE_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "用法: RESTORE_CONFIRM=restore RESTORE_DATABASE_URL=postgresql://... $0 backups/ecommerce-YYYYMMDDTHHMMSSZ.dump.gz" >&2
  exit 2
fi
[[ "${RESTORE_CONFIRM:-}" == "restore" ]] || {
  echo "拒绝执行：恢复会覆盖目标库中的对象。确认目标 URL 后设置 RESTORE_CONFIRM=restore。" >&2
  exit 2
}
[[ -n "$RESTORE_URL" ]] || { echo "✗ 未找到 RESTORE_DATABASE_URL 或 DATABASE_URL" >&2; exit 1; }

PG_RESTORE="${PG_RESTORE:-$(command -v pg_restore || true)}"
[[ -n "$PG_RESTORE" && -x "$PG_RESTORE" ]] || {
  echo "✗ 找不到 pg_restore；请安装与备份兼容的 PostgreSQL client" >&2
  exit 1
}

# Prisma adds `?schema=public`; native pg_restore rejects that query parameter.
normalize_pg_url() {
  DATABASE_URL="$1" python3 - <<'PY'
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
u = urlsplit(os.environ["DATABASE_URL"])
query = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != "schema"]
print(urlunsplit((u.scheme, u.netloc, u.path, urlencode(query), u.fragment)))
PY
}
PG_RESTORE_URL="$(normalize_pg_url "$RESTORE_URL")"

CHECKSUM_FILE="$BACKUP_FILE.sha256"
if [[ -f "$CHECKSUM_FILE" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$CHECKSUM_FILE")")
  else
    (cd "$(dirname "$BACKUP_FILE")" && shasum -a 256 -c "$(basename "$CHECKSUM_FILE")")
  fi
else
  echo "⚠ 未找到 SHA-256 校验文件：$CHECKSUM_FILE（拒绝无校验恢复）" >&2
  exit 1
fi

TMP_ARCHIVE="$(mktemp "${TMPDIR:-/tmp}/ecommerce-restore.XXXXXX")"
trap 'rm -f "$TMP_ARCHIVE"' EXIT
case "$BACKUP_FILE" in
  *.gz) gzip -dc -- "$BACKUP_FILE" > "$TMP_ARCHIVE" ;;
  *.dump) cp -- "$BACKUP_FILE" "$TMP_ARCHIVE" ;;
  *) echo "✗ 不支持的备份格式（仅 .dump 或 .dump.gz）" >&2; exit 2 ;;
esac

# 先验证归档可读，再执行覆盖；--single-transaction 避免半恢复状态。
"$PG_RESTORE" --list "$TMP_ARCHIVE" >/dev/null
echo "→ 恢复到 RESTORE_DATABASE_URL（不会在输出中显示密码）"
"$PG_RESTORE" \
  --clean --if-exists --no-owner --no-privileges \
  --single-transaction --exit-on-error \
  --dbname "$PG_RESTORE_URL" "$TMP_ARCHIVE"

echo "✓ 恢复完成。请立即运行应用 smoke，并在确认数据后安排生产切换。"

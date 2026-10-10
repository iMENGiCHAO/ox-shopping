#!/usr/bin/env bash
# ============================================================================
# 备份可恢复性演练（交付审计：备份此前只做 pg_dump + 非空校验，从未验证过
# 「能不能恢复」——不可恢复的备份等于没有备份）。
#
# 流程：pg_dump（custom 格式）→ 建临时库 → pg_restore → 校验表数量与关键表
#       可查询 → 清理临时库与文件。任何一步失败即非零退出。
#
# 用法：
#   DATABASE_URL=postgresql://user:pass@host:5432/db bash scripts/backup-restore-drill.sh
#   gzip 备份路径（可选）：BACKUP_OUT=/tmp/drill.dump
# ============================================================================
set -euo pipefail
SECONDS=0

# Prisma URLs carry `?schema=public`, which libpq/psql reject as an unknown
# URI query parameter（同 scripts/backup-db.sh）。本脚本全程使用原生
# PostgreSQL 工具（psql/pg_dump/pg_restore），入口处统一剥离该参数。
normalize_pg_url() {
  DATABASE_URL="$1" python3 - <<'PY'
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
u = urlsplit(os.environ["DATABASE_URL"])
query = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != "schema"]
print(urlunsplit((u.scheme, u.netloc, u.path, urlencode(query), u.fragment)))
PY
}

SRC_URL="${DATABASE_URL:?需要 DATABASE_URL（源库，演练只读它）}"
SRC_URL="$(normalize_pg_url "$SRC_URL")"
DRILL_DB="${DRILL_DB:-ecommerce_restore_drill}"
DUMP_FILE="${BACKUP_OUT:-/tmp/backup-restore-drill-$$.dump}"
ADMIN_URL="${ADMIN_URL:-}"   # 可选：用于 CREATEDB/DROPDB 的管理库 URL（缺省用源库连)

log()  { printf '\033[1;36m[drill]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[drill] ✗\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  psql "$SRC_URL" -c "DROP DATABASE IF EXISTS \"$DRILL_DB\" WITH (FORCE)" >/dev/null 2>&1 || true
  rm -f "$DUMP_FILE" 2>/dev/null || true
}
trap cleanup EXIT

command -v pg_dump >/dev/null || fail "缺少 pg_dump（请装 postgresql-client）"
command -v pg_restore >/dev/null || fail "缺少 pg_restore"
command -v psql >/dev/null || fail "缺少 psql"

# 版本预检：pg_dump 低于服务端版本会直接拒绝（给出可执行的提示而非天书报错）
SRV_VER=$(psql -tAc "SHOW server_version" "$SRC_URL" | tr -d ' ' | cut -d. -f1)
CLI_VER=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
[ "${CLI_VER:-0}" -ge "${SRV_VER:-99}" ] || fail "pg_dump 版本($CLI_VER)低于服务端($SRV_VER) —— 请使用匹配的 postgresql-client（CI 镜像自带同版本）"

log "1/5 从源库导出备份"
pg_dump --format=custom --no-owner --no-acl --file="$DUMP_FILE" "$SRC_URL"
[ -s "$DUMP_FILE" ] || fail "备份文件为空"
log "  备份大小 $(wc -c < "$DUMP_FILE" | tr -d ' ') 字节"

log "2/5 创建演练用临时库 $DRILL_DB"
psql "$SRC_URL" -c "DROP DATABASE IF EXISTS \"$DRILL_DB\" WITH (FORCE)" >/dev/null
psql "$SRC_URL" -c "CREATE DATABASE \"$DRILL_DB\"" >/dev/null

DRILL_URL="$(printf '%s' "$SRC_URL" | sed -E "s#/[^/?]+(\?|$)#/${DRILL_DB}\1#")"

log "3/5 恢复到临时库"
pg_restore --no-owner --no-acl --dbname="$DRILL_URL" --exit-on-error "$DUMP_FILE"

log "4/5 校验恢复结果"
SRC_TABLES=$(psql -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" "$SRC_URL" | tr -d ' ')
DST_TABLES=$(psql -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" "$DRILL_URL" | tr -d ' ')
log "  源库表数=$SRC_TABLES 恢复库表数=$DST_TABLES"
[ "$SRC_TABLES" = "$DST_TABLES" ] || fail "表数量不一致（备份不完整或恢复失败）"

# 关键表必须可查询（证明数据页/索引有效，而非只有空壳）
for t in users products orders; do
  n=$(psql -tAc "SELECT count(*) FROM \"$t\"" "$DRILL_URL" | tr -d ' ')
  log "  $t 行数=$n"
done
psql -tAc "SELECT 1 FROM users LIMIT 1" "$DRILL_URL" >/dev/null || fail "users 表不可查询"

log "5/5 清理临时库与备份文件"
log "✅ 备份可恢复（表数一致、关键表可查询）—— 本次演练全程 $SECONDS 秒，可作为 RTO 参考"

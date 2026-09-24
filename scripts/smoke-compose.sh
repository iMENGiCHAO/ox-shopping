#!/usr/bin/env bash
# scripts/smoke-compose.sh — docker-compose 开箱即用一键冒烟验收
#
# 用法（任何装了 Docker 的机器上）：
#   bash scripts/smoke-compose.sh                 # 本地演示模式（模拟支付 + MinIO + 种子）
#   REQUIRE_STRONG=true bash scripts/smoke-compose.sh   # 严格模式（生产 .env 必填项检查）
#
# 流程：静态校验 → 起容器 → 等健康 → /healthz → 前台/后台首页可达 →
#       后台登录（种子账号）→ 日志无 ERROR → 清理（--keep 可保留现场）
# 退出码：0 = 开箱即用验收通过；非 0 = 哪一步失败（现场保留供排查）。
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP=0; [ "${1:-}" = "--keep" ] && KEEP=1
URL=${SMOKE_URL:-http://localhost:3000}
NAME="ox-smoke-$$"
FILES=(-f docker-compose.yml -f docker-compose.local.yml)
STRICT_ARGS=()
[ "${REQUIRE_STRONG:-}" = "true" ] && FILES=(-f docker-compose.yml) && STRICT_ARGS=(--env-file .env)

log()  { printf '\033[1;36m[smoke]\033[0m %s\n' "$*"; }
pass() { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m  ✗\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  [ "$KEEP" = 1 ] && { log "--keep：保留容器（项目名 $NAME）"; return; }
  docker compose -p "$NAME" "${FILES[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

command -v docker >/dev/null 2>&1 || fail "本机没有 docker CLI"
docker info >/dev/null 2>&1 || fail "Docker 守护进程未运行"

log "1/7 静态校验 compose"
docker compose -p "$NAME" "${FILES[@]}" "${STRICT_ARGS[@]}" config -q && pass "compose 配置合法"

log "2/7 构建并启动（首次约几分钟）"
docker compose -p "$NAME" "${FILES[@]}" "${STRICT_ARGS[@]}" up -d --build

log "3/7 等待 /healthz 就绪（最多 300s）"
for i in $(seq 1 100); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/healthz" 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 3
done
[ "$code" = "200" ] || { docker compose -p "$NAME" "${FILES[@]}" logs --tail 60 >&2 || true; fail "/healthz 未就绪（最后状态 $code）"; }
pass "/healthz 200"

log "4/7 关键页面可达"
for path in / /auth/login /admin/login /products /sitemap.xml /robots.txt; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$URL$path")
  { [ "$c" = "200" ] || [ "$c" = "307" ] || [ "$c" = "308" ]; } || fail "GET $path → $c"
  pass "GET $path → $c"
done

log "5/7 后台种子账号登录（仅本地演示模式）"
if [ "${REQUIRE_STRONG:-}" != "true" ]; then
  body=$(curl -s -X POST "$URL/api/auth/login" -H 'content-type: application/json' \
    -c /tmp/$NAME.cookies -b /tmp/$NAME.cookies \
    -H "x-csrf-token: $(curl -s -c /tmp/$NAME.cookies -b /tmp/$NAME.cookies "$URL/api/auth/csrf" | tr -d '\n' | grep -o 'csrf_token.*' | awk '{print $NF}')" \
    -d '{"email":"admin@example.com","password":"Admin@123456"}')
  echo "$body" | grep -q '"user"' || { echo "$body" >&2; rm -f /tmp/$NAME.cookies; fail "种子管理员登录失败"; }
  pass "admin@example.com 登录成功"
  rm -f /tmp/$NAME.cookies
else
  pass "严格模式：跳过种子账号检查"
fi

log "6/7 容器日志无 ERROR 级条目"
logs=$(docker compose -p "$NAME" "${FILES[@]}" logs --no-log-prefix 2>/dev/null || true)
if echo "$logs" | grep -E '(^|[^a-z])ERROR([^a-z]|$)|P202[12]|ECONNREFUSED' | grep -v 'level.*error.*rate' | head -5 | grep -q .; then
  echo "$logs" | grep -E '(^|[^a-z])ERROR([^a-z]|$)|P202[12]|ECONNREFUSED' | head -5 >&2
  fail "日志存在 ERROR"
fi
pass "日志干净"

log "7/7 所有容器健康状态"
for cid in $(docker compose -p "$NAME" "${FILES[@]}" ps -q); do
  st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")
  nm=$(docker inspect -f '{{.Name}}' "$cid")
  [ "$st" = "healthy" ] || [ "$st" = "running" ] || fail "$nm 状态异常: $st"
  pass "$nm → $st"
done

printf '\n\033[1;32m开箱即用验收通过 ✅\033[0m  商城 %s  · 后台 %s/admin\n' "$URL" "$URL"

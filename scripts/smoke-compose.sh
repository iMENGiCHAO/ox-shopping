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

# 演示模式兜底：docker-compose.yml 对 POSTGRES_PASSWORD 等用了 ${VAR:?} 强制插值，
# 在没有 .env 的干净环境（CI runner / 全新 clone）里 config/up 会在插值阶段直接
# 拒绝解析。local overlay 只覆盖各服务 environment 的最终值，救不了基座文件里的
# 强制插值文本（db-backup 不在 overlay 覆盖范围内；不同子命令的插值时机亦有差异）。
# 兜底值与 docker-compose.local.yml 的演示值保持一致；严格模式仍必须用真实 .env。
if [ "${REQUIRE_STRONG:-}" != "true" ]; then
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ecommerce}"
  export REDIS_PASSWORD="${REDIS_PASSWORD:-ecommerce-local-redis}"
  export SITE_URL="${SITE_URL:-http://localhost:3000}"
  export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-docker-compose-access-secret-change-in-prod}"
  export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-docker-compose-refresh-secret-change-in-prod}"
  export PAYMENT_CHANNEL_ENC_KEY="${PAYMENT_CHANNEL_ENC_KEY:-local-demo-payment-channel-enc-key-change-me}"
  export SITE_NAME="${SITE_NAME:-Ox Shopping}"
  export MAIL_PROVIDER="${MAIL_PROVIDER:-console}"
fi

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
  # CSRF 双提交校验（proxy: cookie csrf_token === header x-csrf-token，无服务端状态）。
  # 容器内 NODE_ENV=production → cookie 带 Secure 标志，curl 走 http 不会回传 Secure
  # cookie，因此手工同时携带 Cookie 与请求头；token 取自 GET /api/auth/csrf 响应的
  # data.token（apiHandler 的 json() 统一包 { data } 信封；csrf_token 是 cookie 名）。
  csrf=$(curl -s "$URL/api/auth/csrf" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["token"])') || fail "CSRF token 获取失败"
  [ -n "$csrf" ] || fail "CSRF token 为空"
  body=$(curl -s -X POST "$URL/api/auth/login" -H 'content-type: application/json' \
    -H "Cookie: csrf_token=$csrf" -H "x-csrf-token: $csrf" \
    -d '{"email":"admin@example.com","password":"Admin@123456"}')
  echo "$body" | grep -q '"user"' || { echo "$body" >&2; fail "种子管理员登录失败"; }
  pass "admin@example.com 登录成功"
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

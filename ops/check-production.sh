#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-xiaoshoufupan.woshimake.com}"
STATE_ROOT="${STATE_ROOT:-/var/lib/xiaoshoufupan}"
ENV_FILE="${BACKEND_ENV_FILE:-/etc/xiaoshoufupan/backend.env}"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

nginx -t
systemctl is-active --quiet nginx || fail 'Nginx 不是 active'
systemctl is-enabled --quiet nginx || fail 'Nginx 不是 enabled'
pm2 pid xiaoshoufupan-api | grep -Eq '^[1-9][0-9]*$' || fail 'PM2 API 不是 online'

ping_payload="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/ping)"
grep -Fq '"ok":true' <<<"$ping_payload" || fail '后端 ping 响应不正确'

for mobile_origin in https://localhost capacitor://localhost; do
  cors_headers="$(curl --silent --show-error --max-time 10 --dump-header - --output /dev/null \
    --request OPTIONS http://127.0.0.1:3000/api/todos \
    --header "Origin: ${mobile_origin}" \
    --header 'Access-Control-Request-Method: GET')"
  grep -Fiq "access-control-allow-origin: ${mobile_origin}" <<<"$cors_headers" || \
    fail "原生壳来源没有通过 CORS：${mobile_origin}"
done

untrusted_cors_headers="$(curl --silent --show-error --max-time 10 --dump-header - --output /dev/null \
  --request OPTIONS http://127.0.0.1:3000/api/todos \
  --header 'Origin: https://untrusted.example' \
  --header 'Access-Control-Request-Method: GET')"
if grep -Fiq 'access-control-allow-origin:' <<<"$untrusted_cors_headers"; then
  fail '陌生来源被错误地允许跨域访问 API'
fi

grep -Fxq 'USE_MOCK=true' "$ENV_FILE" || fail 'USE_MOCK 不是 true'
[[ "$(stat -c '%a' "$ENV_FILE")" == '600' ]] || fail '环境文件权限不是 600'
[[ "$(stat -c '%a' "${STATE_ROOT}/data/app.db")" == '600' ]] || fail '数据库权限不是 600'

for route in /me/customers /me/customers/1 /me/customers/1/battlecard /reviews/report/1; do
  page="$(curl --insecure --silent --show-error --max-time 10 \
    --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}${route}")"
  grep -Fq '<div id="root"></div>' <<<"$page" || fail "SPA 深链没有返回应用壳：${route}"
done

api_error="$(curl --insecure --silent --show-error --max-time 10 \
  --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/not-a-real-endpoint")"
if grep -Fq '<div id="root"></div>' <<<"$api_error"; then
  fail 'API 错误被错误地回退成前端 index.html'
fi

printf 'PASS: Nginx、PM2、Mock、权限、原生壳 CORS、SPA 深链与 API 边界均通过。\n'

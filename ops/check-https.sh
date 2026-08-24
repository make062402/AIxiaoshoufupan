#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-xiaoshoufupan.woshimake.com}"
EXPECTED_IPV4="${EXPECTED_IPV4:-8.134.128.117}"

https_headers="$(printf 'HEAD / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n' "$DOMAIN" | \
  openssl s_client \
    -quiet \
    -connect "${EXPECTED_IPV4}:443" \
    -servername "$DOMAIN" \
    -verify_return_error 2>/dev/null)"
printf '%s\n' "$https_headers"
grep -Eq '^HTTP/[^ ]+ 200([[:space:]]|$)' <<<"$https_headers"

http_headers="$(curl --silent --show-error --max-time 15 --head "http://${DOMAIN}/")"
printf '%s\n' "$http_headers"
grep -Eq '^HTTP/[^ ]+ (301|308)([[:space:]]|$)' <<<"$http_headers"
grep -Eiq "^location: https://${DOMAIN}/?([[:space:]]|$)" <<<"$http_headers"

certificate="$(openssl s_client \
  -connect "${EXPECTED_IPV4}:443" \
  -servername "$DOMAIN" \
  -verify_return_error </dev/null 2>/dev/null)"
grep -Fq 'Verify return code: 0 (ok)' <<<"$certificate"
openssl x509 -noout -subject -issuer -dates <<<"$certificate"

printf '\nHTTPS 检查通过：证书链可信，HTTP 自动跳转 HTTPS。\n'

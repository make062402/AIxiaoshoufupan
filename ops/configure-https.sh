#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-xiaoshoufupan.woshimake.com}"
EXPECTED_IPV4="${EXPECTED_IPV4:-8.134.128.117}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  printf '请使用 root 运行，或执行：sudo %s\n' "$0" >&2
  exit 1
fi

if [[ "$DOMAIN" != "xiaoshoufupan.woshimake.com" ]]; then
  printf '拒绝配置未审查的域名：%s\n' "$DOMAIN" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
site_name="${DOMAIN}.conf"
available="/etc/nginx/sites-available/${site_name}"
enabled="/etc/nginx/sites-enabled/${site_name}"
placeholder_root="/var/www/xiaoshoufupan-placeholder"

resolved_ipv4="$({ getent ahostsv4 "$DOMAIN" || true; } | awk '{print $1}' | sort -u)"
if ! grep -Fxq "$EXPECTED_IPV4" <<<"$resolved_ipv4"; then
  printf 'DNS 尚未把 %s 解析到 %s；当前 IPv4：%s\n' \
    "$DOMAIN" "$EXPECTED_IPV4" "${resolved_ipv4:-无}" >&2
  exit 1
fi

apt-get update
apt-get install -y certbot python3-certbot-nginx

install -d -m 0755 "$placeholder_root"
install -m 0644 "${script_dir}/placeholder/index.html" "${placeholder_root}/index.html"

backup_dir="$(mktemp -d /tmp/t52-nginx-backup.XXXXXX)"
cleanup() {
  rm -rf "$backup_dir"
}
trap cleanup EXIT

had_available=0
had_enabled=0
if [[ -e "$available" ]]; then
  had_available=1
  cp -a "$available" "${backup_dir}/available"
fi
if [[ -e "$enabled" || -L "$enabled" ]]; then
  had_enabled=1
  cp -a "$enabled" "${backup_dir}/enabled"
fi

install -m 0644 "${script_dir}/nginx/xiaoshoufupan.woshimake.com.http.conf" "$available"
ln -sfn "$available" "$enabled"

if ! nginx -t; then
  if ((had_available)); then
    cp -a "${backup_dir}/available" "$available"
  else
    rm -f "$available"
  fi
  if ((had_enabled)); then
    rm -f "$enabled"
    cp -a "${backup_dir}/enabled" "$enabled"
  else
    rm -f "$enabled"
  fi
  nginx -t
  printf '新站点配置检查失败，已恢复原有 Nginx 配置。\n' >&2
  exit 1
fi

systemctl reload nginx

certbot_contact=(--register-unsafely-without-email)
if [[ -n "$CERTBOT_EMAIL" ]]; then
  certbot_contact=(--email "$CERTBOT_EMAIL" --no-eff-email)
fi

certbot --nginx \
  --domain "$DOMAIN" \
  --redirect \
  --non-interactive \
  --agree-tos \
  "${certbot_contact[@]}"

nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer
certbot renew --dry-run

printf '\nHTTPS 配置完成：%s\n' "$DOMAIN"

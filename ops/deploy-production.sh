#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-xiaoshoufupan.woshimake.com}"
REPO_URL="${REPO_URL:-https://github.com/make062402/AIxiaoshoufupan.git}"
BRANCH="${BRANCH:-main}"
DEPLOY_FROM_BUNDLE="${DEPLOY_FROM_BUNDLE:-false}"
APP_ROOT="${APP_ROOT:-/opt/xiaoshoufupan/repo}"
STATE_ROOT="${STATE_ROOT:-/var/lib/xiaoshoufupan}"
WEB_ROOT="${WEB_ROOT:-/var/www/xiaoshoufupan}"
ENV_ROOT="${ENV_ROOT:-/etc/xiaoshoufupan}"
ENV_FILE="${BACKEND_ENV_FILE:-${ENV_ROOT}/backend.env}"
LOG_ROOT="${APP_LOG_ROOT:-/var/log/xiaoshoufupan}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}.conf"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  printf '请使用 root 运行，或执行：sudo %s\n' "$0" >&2
  exit 1
fi

if [[ "$DOMAIN" != "xiaoshoufupan.woshimake.com" ]]; then
  printf '拒绝部署未审查的域名：%s\n' "$DOMAIN" >&2
  exit 1
fi

for command_name in git node npm nginx pm2 curl openssl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '缺少依赖命令：%s；请先完成 T51/T52。\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ||
      ! -s "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]]; then
  printf '没有找到 %s 的证书，请先完成 T52。\n' "$DOMAIN" >&2
  exit 1
fi

install -d -m 0755 "$(dirname "$APP_ROOT")" "$WEB_ROOT" "${WEB_ROOT}/releases"
install -d -m 0700 "$STATE_ROOT" "${STATE_ROOT}/data" "$ENV_ROOT"
install -d -m 0750 "$LOG_ROOT"

if [[ "$DEPLOY_FROM_BUNDLE" == "true" ]]; then
  if [[ ! -f "${APP_ROOT}/backend/package.json" ||
        ! -f "${APP_ROOT}/frontend/package.json" ]]; then
    printf '离线部署包不完整：%s 必须包含 backend 与 frontend。\n' "$APP_ROOT" >&2
    exit 1
  fi
  source_revision="${SOURCE_REVISION:-bundle}"
elif [[ ! -d "${APP_ROOT}/.git" ]]; then
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_ROOT"
  source_revision="$(git -C "$APP_ROOT" rev-parse --short HEAD)"
else
  actual_origin="$(git -C "$APP_ROOT" remote get-url origin)"
  if [[ "$actual_origin" != "$REPO_URL" ]]; then
    printf '拒绝更新来源不一致的仓库：%s\n' "$actual_origin" >&2
    exit 1
  fi
  git -C "$APP_ROOT" fetch origin "$BRANCH"
  git -C "$APP_ROOT" checkout "$BRANCH"
  git -C "$APP_ROOT" pull --ff-only origin "$BRANCH"
  source_revision="$(git -C "$APP_ROOT" rev-parse --short HEAD)"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  (
    umask 077
    {
      printf 'PORT=3000\n'
      printf 'DB_FILE=%s/data/app.db\n' "$STATE_ROOT"
      printf 'DIFY_API_KEY=\n'
      printf 'DIFY_BASE_URL=https://api.dify.ai/v1\n'
      printf 'CONFIG_ADMIN_TOKEN=\n'
      printf 'USE_MOCK=true\n'
    } >"$ENV_FILE"
  )
fi
chmod 0600 "$ENV_FILE"

if ! grep -Fxq 'USE_MOCK=true' "$ENV_FILE"; then
  printf '生产部署被拒绝：%s 必须明确包含 USE_MOCK=true。\n' "$ENV_FILE" >&2
  exit 1
fi

ln -sfn "$ENV_FILE" "${APP_ROOT}/backend/.env"

npm --prefix "${APP_ROOT}/backend" ci
npm --prefix "${APP_ROOT}/frontend" ci
npm --prefix "${APP_ROOT}/frontend" run build

db_file="${STATE_ROOT}/data/app.db"
if [[ ! -e "$db_file" ]]; then
  printf '首次部署：初始化并写入演示 Seed。\n'
  (
    cd "${APP_ROOT}/backend"
    DB_FILE="$db_file" USE_MOCK=true npm run db:push
    DB_FILE="$db_file" USE_MOCK=true npm run db:seed
  )
else
  printf '检测到既有数据库，跳过 db:push 与 db:seed：%s\n' "$db_file"
fi
chmod 0600 "$db_file"

release_id="$(date -u +%Y%m%dT%H%M%SZ)-${source_revision}"
release_dir="${WEB_ROOT}/releases/${release_id}"
install -d -m 0755 "$release_dir"
cp -a "${APP_ROOT}/frontend/dist/." "$release_dir/"
find "$release_dir" -type d -exec chmod 0755 {} +
find "$release_dir" -type f -exec chmod 0644 {} +
ln -sfn "$release_dir" "${WEB_ROOT}/current.next"
mv -Tf "${WEB_ROOT}/current.next" "${WEB_ROOT}/current"

APP_ROOT="$APP_ROOT" BACKEND_ENV_FILE="$ENV_FILE" APP_LOG_ROOT="$LOG_ROOT" \
  pm2 start "${script_dir}/ecosystem.config.cjs" --update-env
pm2 save
pm2 startup systemd -u root --hp /root

backup_site="$(mktemp /tmp/t53-nginx-site.XXXXXX)"
had_site=0
if [[ -e "$NGINX_SITE" ]]; then
  had_site=1
  cp -a "$NGINX_SITE" "$backup_site"
fi

install -m 0644 "${script_dir}/nginx/${DOMAIN}.production.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"

if ! nginx -t; then
  if ((had_site)); then
    cp -a "$backup_site" "$NGINX_SITE"
  else
    rm -f "$NGINX_SITE" "$NGINX_ENABLED"
  fi
  rm -f "$backup_site"
  nginx -t
  printf '生产 Nginx 配置失败，已恢复部署前配置。\n' >&2
  exit 1
fi
rm -f "$backup_site"
systemctl reload nginx

"${script_dir}/check-production.sh"

printf '\n生产部署完成：%s（%s）\n' "$DOMAIN" "$release_id"

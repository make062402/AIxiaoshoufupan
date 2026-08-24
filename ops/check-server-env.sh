#!/usr/bin/env bash
set -euo pipefail

failures=0

pass() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  printf 'OS: %s (%s)\n' "${PRETTY_NAME:-unknown}" "${VERSION_CODENAME:-unknown}"
else
  fail '无法读取 /etc/os-release'
fi

if command -v node >/dev/null 2>&1; then
  node_version="$(node -v)"
  printf 'Node.js: %s\n' "$node_version"
  if [[ "$node_version" == v22.* ]]; then
    pass 'Node.js 主版本为 22'
  else
    fail "Node.js 主版本不是 22（当前 ${node_version}）"
  fi
else
  fail '未安装 Node.js'
fi

if command -v npm >/dev/null 2>&1; then
  printf 'npm: %s\n' "$(npm -v)"
  pass 'npm 可执行'
else
  fail '未安装 npm'
fi

if command -v nginx >/dev/null 2>&1; then
  nginx_version="$(nginx -v 2>&1)"
  printf 'Nginx: %s\n' "$nginx_version"
  if nginx -t >/dev/null 2>&1; then
    pass 'Nginx 配置语法正确'
  else
    fail 'Nginx 配置语法检查失败'
  fi
else
  fail '未安装 Nginx'
fi

if ! command -v systemctl >/dev/null 2>&1; then
  fail '系统缺少 systemctl，无法检查 Nginx 服务'
elif systemctl is-active --quiet nginx; then
  pass 'Nginx 服务为 active'
else
  fail 'Nginx 服务不是 active'
fi

if ! command -v systemctl >/dev/null 2>&1; then
  fail '系统缺少 systemctl，无法检查开机启动'
elif systemctl is-enabled --quiet nginx; then
  pass 'Nginx 已设置为开机启动'
else
  fail 'Nginx 未设置为开机启动'
fi

if ! command -v ss >/dev/null 2>&1; then
  fail '系统缺少 ss，无法检查 TCP 80'
elif ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)80$'; then
  pass 'TCP 80 已监听'
else
  fail 'TCP 80 未监听'
fi

if ! command -v curl >/dev/null 2>&1; then
  fail '系统缺少 curl，无法检查本机 HTTP'
elif curl --fail --silent --show-error --max-time 5 http://127.0.0.1/ >/dev/null; then
  pass '服务器本机访问 Nginx 返回成功'
else
  fail '服务器本机无法访问 Nginx'
fi

if command -v pm2 >/dev/null 2>&1; then
  printf 'PM2: %s\n' "$(pm2 -v)"
  if pm2 status >/dev/null; then
    pass 'PM2 状态命令可执行'
  else
    fail 'PM2 状态命令执行失败'
  fi
else
  fail '未安装 PM2'
fi

if ((failures > 0)); then
  printf '\n环境检查失败：%d 项未通过。\n' "$failures" >&2
  exit 1
fi

printf '\n环境检查通过。\n'

#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-22}"
PM2_VERSION="${PM2_VERSION:-7.0.3}"

if [[ "$(id -u)" -ne 0 ]]; then
  printf '请使用 root 运行，或执行：sudo %s\n' "$0" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  printf '无法识别操作系统：缺少 /etc/os-release\n' >&2
  exit 1
fi

# shellcheck disable=SC1091
. /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "22.04" ]]; then
  printf '仅支持 Ubuntu 22.04；当前为 %s %s\n' "${ID:-unknown}" "${VERSION_ID:-unknown}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg

node_major=""
if command -v node >/dev/null 2>&1; then
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
fi

if [[ "$node_major" != "$NODE_MAJOR" ]]; then
  setup_script="$(mktemp /tmp/nodesource-setup.XXXXXX.sh)"
  trap 'rm -f "$setup_script"' EXIT
  curl --fail --silent --show-error --location \
    "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" \
    --output "$setup_script"
  bash "$setup_script"

  # Ubuntu 自带的旧 Node 开发头文件会与 NodeSource 的头文件冲突。
  if dpkg-query -W -f='${Status}' libnode-dev 2>/dev/null | grep -q 'install ok installed'; then
    apt-get remove -y libnode-dev
  fi

  apt-get install -y nodejs
fi

apt-get install -y nginx
nginx -t
systemctl enable --now nginx

npm install --global "pm2@${PM2_VERSION}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${script_dir}/check-server-env.sh"

printf '\n安装完成。此脚本未修改 UFW、云安全组或宝塔配置。\n'

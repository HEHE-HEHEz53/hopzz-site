#!/bin/bash
# 基础系统初始化：更新 + 常用工具。
# 幂等：可重复执行。
export DEBIAN_FRONTEND=noninteractive
set -euo pipefail

echo "### 1/3 apt-get update"
apt-get update -y

echo "### 2/3 升级已装软件包（保留现有配置文件）"
apt-get -y -o Dpkg::Options::="--force-confold" -o Dpkg::Options::="--force-confdef" upgrade

echo "### 3/3 安装基础工具"
apt-get -y install \
  curl wget git vim htop unzip zip jq \
  ca-certificates gnupg2 lsb-release apt-transport-https \
  python3 python3-venv python3-pip \
  sqlite3 rsync tmux nginx

echo "=== 版本确认 ==="
nginx -v 2>&1
python3 -V
git --version
echo "SETUP_BASE_DONE"

#!/usr/bin/env bash
# =====================================================================
# install.sh —— 在 Debian 12 服务器上安装 opcpay-bridge
#
# 用法（在服务器上、本目录里执行）：
#   sudo bash install.sh
#
# 幂等：重复执行只会更新代码、重启服务；不会覆盖已有的 .env（不会弄丢 Key）。
#
# 做这些事：
#   1. 检查 Node 18+（Debian 12 自带源就是 18.19+，不够才装 NodeSource）
#   2. 把代码装到 /opt/opcpay-bridge，npm install 生产依赖
#   3. .env 不存在时创建空白模板（600，www-data），存在则保留
#   4. 安装 systemd 单元 opcpay-bridge，启用并启动
#   5. 探活 /health
# =====================================================================
set -euo pipefail

APP_DIR=/opt/opcpay-bridge
SERVICE=opcpay-bridge
SRC_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
NODE_BIN=/usr/bin/node

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\n[错误] %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash install.sh"

# ---------------------------------------------------------------- 1. Node
say "1/5 检查 Node.js"
if [ -x "$NODE_BIN" ]; then
  NODE_MAJOR=$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')
else
  NODE_MAJOR=0
fi

if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "    当前 Node 版本不足或未安装（major=$NODE_MAJOR），尝试安装 Node 18+"
  export DEBIAN_FRONTEND=noninteractive
  if apt-get install -y --no-install-recommends nodejs npm; then
    NODE_MAJOR=$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  fi
  if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "    发行版源版本太老，改用 NodeSource 20.x"
    apt-get install -y --no-install-recommends ca-certificates curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y --no-install-recommends nodejs
    NODE_MAJOR=$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')
  fi
fi
[ "$NODE_MAJOR" -ge 18 ] || die "Node 安装失败"
echo "    node $("$NODE_BIN" -v)  npm $(npm -v)"

# ---------------------------------------------------------------- 2. 代码
say "2/5 安装代码到 $APP_DIR"
mkdir -p "$APP_DIR/scripts"
install -m 0644 "$SRC_DIR/server.mjs"   "$APP_DIR/server.mjs"
install -m 0644 "$SRC_DIR/package.json" "$APP_DIR/package.json"
if [ -f "$SRC_DIR/package-lock.json" ]; then
  install -m 0644 "$SRC_DIR/package-lock.json" "$APP_DIR/package-lock.json"
fi
if [ -d "$SRC_DIR/scripts" ]; then
  cp -a "$SRC_DIR/scripts/." "$APP_DIR/scripts/"
fi
chown -R root:root "$APP_DIR/server.mjs" "$APP_DIR/package.json" "$APP_DIR/scripts"

cd "$APP_DIR"
if [ -f package-lock.json ]; then
  # 有锁文件就用 ci，版本可复现
  npm ci --omit=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi
echo "    opcpay SDK: $(node -p "require('./node_modules/opcpay/package.json').version")"

# ---------------------------------------------------------------- 3. .env
say "3/5 检查 .env"
if [ ! -f "$APP_DIR/.env" ]; then
  umask 077
  cat > "$APP_DIR/.env" <<'EOF'
# 一人付项目 API Key。真实值只保存在本机，不入库、不发前端、不写日志。
opcpay_api_key=
EOF
  echo "    已创建空白 $APP_DIR/.env —— 请填入 opcpay_api_key 后重启服务"
else
  echo "    已存在 $APP_DIR/.env，保留不动"
fi
chown www-data:www-data "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

if ! grep -qE '^opcpay_api_key=.+' "$APP_DIR/.env"; then
  echo "    [注意] $APP_DIR/.env 里还没有 opcpay_api_key，服务会启动失败"
fi

# ---------------------------------------------------------------- 4. systemd
say "4/5 安装 systemd 单元"
install -m 0644 "$SRC_DIR/opcpay-bridge.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 2

if ! systemctl is-active --quiet "$SERVICE"; then
  journalctl -u "$SERVICE" -n 20 --no-pager || true
  die "服务没有起来，看上面的 journal"
fi
echo "    $(systemctl is-active "$SERVICE") · $(systemctl is-enabled "$SERVICE")"

# ---------------------------------------------------------------- 5. 探活
say "5/5 探活"
if curl -fsS --max-time 5 "http://127.0.0.1:8102/health"; then
  echo
  echo "    OK：opcpay-bridge 已在 127.0.0.1:8102 上运行"
else
  die "探活失败：/health 无响应"
fi

say "完成"
echo "    只读核对真实套餐：cd $APP_DIR && node scripts/readonly-query.mjs"
echo "    看日志：journalctl -u $SERVICE -f"

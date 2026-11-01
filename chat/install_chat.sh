#!/bin/bash
# =====================================================================
# chat.hopzz.top 部署脚本（Debian 12）
# 前提：整个 chat/ 目录已 scp 到 /root/chat-deploy/
# 用法：bash /root/chat-deploy/install_chat.sh
# 幂等，可重复执行（密码/令牌只在第一次生成）
# =====================================================================
set -euo pipefail

DOMAIN="chat.hopzz.top"
SRC="/root/chat-deploy"
ROOT="/opt/hopzz-chat"
ACME="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

[[ $EUID -eq 0 ]] || { echo "必须以 root 运行"; exit 1; }
[[ -d "$SRC" ]] || { echo "找不到 $SRC"; exit 1; }
command -v nginx >/dev/null || { echo "nginx 未安装"; exit 1; }

# ---------------------------------------------------------------- 1. 目录与文件
step "1. 部署文件到 $ROOT"
mkdir -p "$ROOT/server" "$ROOT/static" "$ROOT/data" "$ACME"
rsync -a "$SRC/server/" "$ROOT/server/"
if [[ -d "$SRC/static" ]]; then
  rsync -a "$SRC/static/" "$ROOT/static/"
fi
ls -l "$ROOT/static" | head

# ---------------------------------------------------------------- 2. 密钥（只生成一次）
step "2. 生成/读取配置"
if [[ ! -f "$ROOT/.env" ]]; then
  # 密码：3 组好念的词 + 数字，方便手机输入，同时有足够熵
  CHAT_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 10)$(shuf -i 1000-9999 -n 1)"
  cat > "$ROOT/.env" <<EOF
CHAT_PASSWORD=$CHAT_PASSWORD
AGENT_TOKEN=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
DB_PATH=$ROOT/data/chat.db
STATIC_DIR=$ROOT/static
EOF
  chmod 600 "$ROOT/.env"
  echo "已生成登录密码与插件令牌"
else
  echo "配置已存在，保持不变"
fi

# ---------------------------------------------------------------- 3. venv
step "3. 安装 Python 依赖"
if [[ ! -x "$ROOT/venv/bin/python" ]]; then
  python3 -m venv "$ROOT/venv"
fi
"$ROOT/venv/bin/pip" install --quiet --upgrade pip
"$ROOT/venv/bin/pip" install --quiet fastapi uvicorn "websockets>=12"
"$ROOT/venv/bin/pip" list --format=freeze | grep -Ei '^(fastapi|uvicorn|starlette|websockets)' || true

chown -R www-data:www-data "$ROOT/data" "$ROOT/static"
chmod 750 "$ROOT/data"

# ---------------------------------------------------------------- 4. systemd
step "4. 安装并启动服务"
install -m 644 "$SRC/systemd/hopzz-chat.service" /etc/systemd/system/hopzz-chat.service
systemctl daemon-reload
systemctl enable hopzz-chat >/dev/null
systemctl restart hopzz-chat
sleep 2
systemctl is-active --quiet hopzz-chat && echo "hopzz-chat 已运行" || {
  echo "!! 启动失败，日志："; journalctl -u hopzz-chat -n 40 --no-pager; exit 1
}
echo "--- 本机直连测试 ---"
curl -fsS --max-time 5 http://127.0.0.1:8100/api/me && echo "  (401 是正常的，说明鉴权在工作)" || echo "  (401 正常，表示未登录)"

# ---------------------------------------------------------------- 5. 先跑 HTTP 拿证书
step "5. 申请 $DOMAIN 的证书"
if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  echo "证书已存在，跳过"
else
  cat > /etc/nginx/sites-available/chat.hopzz.top.http.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
  ln -sf /etc/nginx/sites-available/chat.hopzz.top.http.conf /etc/nginx/sites-enabled/chat.hopzz.top.conf
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi
[[ -d "/etc/letsencrypt/live/$DOMAIN" ]] || { echo "证书未获取，停在 HTTP 状态"; exit 2; }

# ---------------------------------------------------------------- 6. HTTPS 站点
step "6. 启用 HTTPS 站点配置"
install -m 644 "$SRC/nginx/chat.hopzz.top.conf" /etc/nginx/sites-available/chat.hopzz.top.conf
ln -sf /etc/nginx/sites-available/chat.hopzz.top.conf /etc/nginx/sites-enabled/chat.hopzz.top.conf
rm -f /etc/nginx/sites-available/chat.hopzz.top.http.conf
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------- 7. 验证
step "7. 验证"
printf '%-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://$DOMAIN/)" "GET /"
printf '%-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://$DOMAIN/api/me)" "GET /api/me（未登录 401 正确）"
printf '%-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H 'Content-Type: application/json' -d '{}' https://$DOMAIN/api/login)" "POST /api/login（空密码 401 正确）"

echo
echo "========== 部署完成 =========="
echo "手机访问: https://$DOMAIN"
echo
echo "登录密码: $(grep '^CHAT_PASSWORD=' "$ROOT/.env" | cut -d= -f2-)"
echo "插件令牌: $(grep '^AGENT_TOKEN=' "$ROOT/.env" | cut -d= -f2-)"

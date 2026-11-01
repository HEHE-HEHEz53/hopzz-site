#!/bin/bash
# =====================================================================
# 部署「鲸鱼娘在线」网页端
# 用法：
#   bash install_chat.sh ai.example.com        # 域名（自动签 HTTPS 证书）
#   bash install_chat.sh 1.2.3.4:8888          # IP:端口（纯 HTTP，不签证书）
# 幂等；已有令牌/证书会保留。
# =====================================================================
set -euo pipefail

ADDR="${1:-${ADDR:-ai.hopzz.top}}"
SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/opt/hopzz-chat"
ACME="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

[[ $EUID -eq 0 ]] || { echo "需要 root"; exit 1; }
command -v nginx >/dev/null || { echo "没装 nginx：apt -y install nginx"; exit 1; }
command -v python3 >/dev/null || { echo "没装 python3"; exit 1; }

if [[ "$ADDR" == *:* ]]; then
  MODE="ipport"
  LISTEN_PORT="${ADDR##*:}"
  HOST_ONLY="${ADDR%%:*}"
else
  MODE="domain"
  LISTEN_PORT="443"
  HOST_ONLY="$ADDR"
fi

step "0. 目标：$ADDR（模式：$MODE）"

step "1. 目录与文件"
mkdir -p "$APP/server" "$APP/static" "$APP/data" "$ACME"
rsync -a "$SRC/server/" "$APP/server/"
[ -d "$SRC/static" ] && rsync -a "$SRC/static/" "$APP/static/"
echo "已同步到 $APP"

step "2. 密钥（只生成一次）"
if [[ ! -f "$APP/.env" ]]; then
  cat > "$APP/.env" <<EOF
AGENT_TOKEN=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
DB_PATH=$APP/data/chat.db
STATIC_DIR=$APP/static
EOF
  chmod 600 "$APP/.env"
  echo "已生成 AGENT_TOKEN / COOKIE_SECRET"
else
  echo "配置已存在，保留"
fi

step "3. Python 依赖"
[[ -x "$APP/venv/bin/python" ]] || python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install --quiet --upgrade pip
"$APP/venv/bin/pip" install --quiet fastapi uvicorn "websockets>=12"

step "4. 权限与 systemd"
chown -R www-data:www-data "$APP/data" "$APP/static"
chmod 750 "$APP/data"
install -m 644 "$SRC/systemd/hopzz-chat.service" /etc/systemd/system/hopzz-chat.service
systemctl daemon-reload
systemctl enable hopzz-chat >/dev/null
systemctl restart hopzz-chat
sleep 2
systemctl is-active --quiet hopzz-chat || { echo "启动失败："; journalctl -u hopzz-chat -n 30 --no-pager; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:8100/api/setup-state && echo

if [[ "$MODE" == "domain" ]]; then
  step "5. 证书（$HOST_ONLY）"
  if [[ ! -d "/etc/letsencrypt/live/$HOST_ONLY" ]]; then
    cat > /etc/nginx/sites-available/_acme-temp.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $HOST_ONLY;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
    ln -sf /etc/nginx/sites-available/_acme-temp.conf /etc/nginx/sites-enabled/_acme-temp.conf
    nginx -t && systemctl reload nginx
    command -v certbot >/dev/null || apt-get -y install certbot >/dev/null
    certbot certonly --webroot -w "$ACME" -d "$HOST_ONLY" \
      --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || true
    rm -f /etc/nginx/sites-enabled/_acme-temp.conf /etc/nginx/sites-available/_acme-temp.conf
  fi
  if [[ ! -d "/etc/letsencrypt/live/$HOST_ONLY" ]]; then
    echo "!! 证书没拿到（域名可能没解析到这台机器），自动改用 HTTP 模式"
    MODE="ipport"
    LISTEN_PORT="80"
  fi
fi

step "6. 安装 nginx 站点"
CONF="/etc/nginx/sites-available/hopzz-chat-$HOST_ONLY.conf"
if [[ "$MODE" == "domain" ]]; then
  sed "s/ai\.hopzz\.top/$HOST_ONLY/g" "$SRC/nginx/ai.hopzz.top.conf" > "$CONF"
else
  cat > "$CONF" <<EOF
server {
    listen $LISTEN_PORT;
    listen [::]:$LISTEN_PORT;
    server_name _;
    client_max_body_size 0;
    add_header X-Content-Type-Options nosniff always;

    location /ws {
        proxy_pass http://127.0.0.1:8100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    location /agent-ws {
        proxy_pass http://127.0.0.1:8100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        access_log off;
    }
    location / {
        proxy_pass http://127.0.0.1:8100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 360s;
    }
}
EOF
fi
ln -sf "$CONF" "/etc/nginx/sites-enabled/$(basename "$CONF")"
nginx -t
systemctl reload nginx

step "7. 验证"
if [[ "$MODE" == "domain" ]]; then URL="https://$HOST_ONLY"; else URL="http://$HOST_ONLY:$LISTEN_PORT"; fi
echo "访问地址：$URL"
c1=$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || echo ERR)
c2=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/setup-state" || echo ERR)
echo "首页 $c1   接口 $c2"

TOKEN="$(grep '^AGENT_TOKEN=' "$APP/.env" | cut -d= -f2-)"
echo
echo "========== 完成 =========="
echo "网页地址:   $URL"
if [[ "$MODE" == "domain" ]]; then echo "插件地址:   wss://$HOST_ONLY/agent-ws"; else echo "插件地址:   ws://$HOST_ONLY:$LISTEN_PORT/agent-ws"; fi
echo "插件令牌:   $TOKEN"
echo "首次打开网页会让你设置密码。"

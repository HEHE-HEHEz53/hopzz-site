#!/bin/bash
# =====================================================================
# 部署「鲸鱼娘在线」网页端（可换域名）
# 用法：
#   bash install_chat.sh                    # 默认 ai.hopzz.top
#   bash install_chat.sh example.com        # 自定义域名
# 幂等：可以重复执行；已有令牌/证书会被保留。
# =====================================================================
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-ai.hopzz.top}}"
SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/opt/hopzz-chat"
ACME="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

[[ $EUID -eq 0 ]] || { echo "需要 root"; exit 1; }
command -v nginx >/dev/null || { echo "没装 nginx：apt -y install nginx"; exit 1; }
command -v python3 >/dev/null || { echo "没装 python3"; exit 1; }

step "0. 目标域名：$DOMAIN"

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

step "5. 证书（$DOMAIN）"
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  cat > /etc/nginx/sites-available/_acme-temp.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
  ln -sf /etc/nginx/sites-available/_acme-temp.conf /etc/nginx/sites-enabled/_acme-temp.conf
  nginx -t && systemctl reload nginx
  command -v certbot >/dev/null || apt-get -y install certbot >/dev/null
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
  rm -f /etc/nginx/sites-enabled/_acme-temp.conf /etc/nginx/sites-available/_acme-temp.conf
else
  echo "证书已存在，跳过"
fi
[[ -d "/etc/letsencrypt/live/$DOMAIN" ]] || { echo "证书没拿到：域名解析或 80 端口有问题"; exit 2; }

step "6. 安装 nginx 站点"
sed "s/ai\.hopzz\.top/$DOMAIN/g" "$SRC/nginx/ai.hopzz.top.conf" \
  > "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
nginx -t
systemctl reload nginx

step "7. 验证"
c1=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || echo ERR)
c2=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/setup-state" || echo ERR)
echo "首页 $c1   接口 $c2"

TOKEN="$(grep '^AGENT_TOKEN=' "$APP/.env" | cut -d= -f2-)"
echo
echo "========== 完成 =========="
echo "地址:      https://$DOMAIN"
echo "插件地址:  wss://$DOMAIN/agent-ws（插件里填这个，或者从网页复制连接字符串）"
echo "插件令牌:  $TOKEN"
echo "首次打开网页会让你设置密码。"

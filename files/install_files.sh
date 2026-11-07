#!/bin/bash
# =====================================================================
# f.hopzz.top 鲸鱼娘网盘 部署脚本
# 前提：files/ 目录已 scp 到 /root/files-deploy/
# =====================================================================
set -euo pipefail

DOMAIN="f.hopzz.top"
SHARE_DOMAIN="yun.hopzz.top"
SRC="/root/files-deploy"
ROOT_DIR="/srv/files"
APP="/opt/hopzz-files"
ACME="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

[[ $EUID -eq 0 ]] || { echo "必须以 root 运行"; exit 1; }
[[ -d "$SRC" ]] || { echo "找不到 $SRC"; exit 1; }

step "1. 目录"
mkdir -p "$APP/server" "$APP/static" "$APP/data" "$ROOT_DIR/快速上传" "$ACME"
rsync -a "$SRC/server/" "$APP/server/"
if [ -d "$SRC/static" ]; then rsync -a "$SRC/static/" "$APP/static/"; fi

step "2. 密码与密钥（只生成一次）"
if [ ! -f "$APP/.env" ]; then
  GEN="$(openssl rand -base64 32 | tr -d '/+=' | head -c 9)$(shuf -i 1000-9999 -n 1)"
  cat > "$APP/.env" <<EOF
FILE_PASSWORD=$GEN
COOKIE_SECRET=$(openssl rand -hex 32)
ROOT_DIR=$ROOT_DIR
DB_PATH=$APP/data/files.db
STATIC_DIR=$APP/static
EOF
  chmod 600 "$APP/.env"
  echo "已生成网盘密码"
else
  echo "配置已存在，保持不变"
fi

step "3. Python 依赖"
if [ ! -x "$APP/venv/bin/python" ]; then python3 -m venv "$APP/venv"; fi
"$APP/venv/bin/pip" install --quiet --upgrade pip
# python-multipart 是 FastAPI 接收文件上传必需的
"$APP/venv/bin/pip" install --quiet fastapi uvicorn python-multipart
"$APP/venv/bin/pip" list --format=freeze | grep -Ei '^(fastapi|uvicorn|python-multipart|starlette)' || true

step "4. 权限"
mkdir -p "$ROOT_DIR/快速上传"
chown -R www-data:www-data "$ROOT_DIR" "$APP/data" "$APP/static"
chmod 755 "$ROOT_DIR"
chmod 750 "$APP/data"

step "5. systemd"
install -m 644 "$SRC/systemd/hopzz-files.service" /etc/systemd/system/hopzz-files.service
systemctl daemon-reload
systemctl enable hopzz-files >/dev/null
systemctl restart hopzz-files
sleep 2
systemctl is-active --quiet hopzz-files && echo "hopzz-files 已运行" || {
  echo "!! 启动失败："; journalctl -u hopzz-files -n 40 --no-pager; exit 1
}
curl -fsS --max-time 5 http://127.0.0.1:8200/api/health && echo

step "6. 证书"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  cat > /etc/nginx/sites-available/f.hopzz.top.http.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
  ln -sf /etc/nginx/sites-available/f.hopzz.top.http.conf /etc/nginx/sites-enabled/f.hopzz.top.conf
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi
[ -d "/etc/letsencrypt/live/$DOMAIN" ] || { echo "证书没拿到"; exit 2; }

step "7. nginx 站点"
install -m 644 "$SRC/nginx/f.hopzz.top.conf" /etc/nginx/sites-available/f.hopzz.top.conf
ln -sf /etc/nginx/sites-available/f.hopzz.top.conf /etc/nginx/sites-enabled/f.hopzz.top.conf
rm -f /etc/nginx/sites-available/f.hopzz.top.http.conf
nginx -t
systemctl reload nginx

step "7b. 分享域名（$SHARE_DOMAIN）"
if [ ! -d "/etc/letsencrypt/live/$SHARE_DOMAIN" ]; then
  cat > "/etc/nginx/sites-available/$SHARE_DOMAIN.http.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SHARE_DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
  ln -sf "/etc/nginx/sites-available/$SHARE_DOMAIN.http.conf" "/etc/nginx/sites-enabled/$SHARE_DOMAIN.conf"
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w "$ACME" -d "$SHARE_DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || true
fi
if [ -d "/etc/letsencrypt/live/$SHARE_DOMAIN" ]; then
  install -m 644 "$SRC/nginx/$SHARE_DOMAIN.conf" "/etc/nginx/sites-available/$SHARE_DOMAIN.conf"
  ln -sf "/etc/nginx/sites-available/$SHARE_DOMAIN.conf" "/etc/nginx/sites-enabled/$SHARE_DOMAIN.conf"
  rm -f "/etc/nginx/sites-available/$SHARE_DOMAIN.http.conf"
  echo "分享域名已配置"
else
  echo "!! $SHARE_DOMAIN 证书没拿到（检查 DNS 是否指向本机），先只用 /gx/ 路径"
fi
nginx -t
systemctl reload nginx

step "8. 验证"
printf '首页       %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/)"
printf '未登录接口  %s (401 OK)\n' "$(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/api/me)"
printf '健康检查   %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/api/health)"
printf '分享域名   %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://$SHARE_DOMAIN/ || echo '未配置')"

echo
echo "========== 完成 =========="
echo "地址:   https://$DOMAIN"
echo "密码:   $(grep '^FILE_PASSWORD=' "$APP/.env" | cut -d= -f2-)"
echo "目录:   $ROOT_DIR"
echo "快速上传: $ROOT_DIR/快速上传"

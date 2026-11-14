#!/bin/bash
# =====================================================================
# 部署 music.hopzz.top 播放器（Debian 12）
# 用法：bash install_music.sh
# 幂等；已有录音与 .env 不会被动
# =====================================================================
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/opt/hopzz-music"
MUSIC_ROOT="/srv/music"
ACME="/var/www/certbot"
DOMAIN="music.hopzz.top"

step() { echo; echo "========== $* =========="; }

[[ $EUID -eq 0 ]] || { echo "需要 root"; exit 1; }
command -v nginx >/dev/null || { echo "没装 nginx"; exit 1; }

step "0. 目标：$DOMAIN"

step "1. 目录"
mkdir -p "$APP/server" "$APP/static" "$APP/data" "$MUSIC_ROOT" "$ACME"

step "2. 同步代码"
rsync -a --exclude '__pycache__' "$SRC/server/" "$APP/server/"
[ -d "$SRC/static" ] && rsync -a "$SRC/static/" "$APP/static/"
echo "已同步到 $APP"

step "3. 环境配置（只生成一次）"
if [[ ! -f "$APP/.env" ]]; then
  cat > "$APP/.env" <<EOF
SIGN_SECRET=$(openssl rand -hex 32)
MUSIC_ROOT=$MUSIC_ROOT
STATIC_DIR=$APP/static
TOKEN_TTL=7200
EOF
  chmod 640 "$APP/.env"
  chown root:www-data "$APP/.env"
  echo "已生成 SIGN_SECRET"
else
  echo "配置已存在，保留"
fi

step "4. Python 依赖"
python3 -c 'import ensurepip' >/dev/null 2>&1 || apt-get -y install python3-venv >/dev/null 2>&1 || true
if [[ -x "$APP/venv/bin/python" ]] && ! "$APP/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  rm -rf "$APP/venv"
fi
if [[ ! -x "$APP/venv/bin/python" ]]; then
  python3 -m venv "$APP/venv" || {
    rm -rf "$APP/venv"; mkdir -p "$APP/venv/bin"
    ln -sf "$(command -v python3)" "$APP/venv/bin/python"
    ln -sf "$(command -v python3)" "$APP/venv/bin/python3"
  }
fi
"$APP/venv/bin/python" -m pip --version >/dev/null 2>&1 || "$APP/venv/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true
PIPFLAGS=""
"$APP/venv/bin/python" -m pip --version >/dev/null 2>&1 || PIPFLAGS="--break-system-packages"
"$APP/venv/bin/python" -m pip install $PIPFLAGS --quiet --upgrade pip || true
"$APP/venv/bin/python" -m pip install $PIPFLAGS --quiet fastapi "uvicorn[standard]"

step "5. 权限"
chown -R www-data:www-data "$MUSIC_ROOT" "$APP/static"
chmod 755 "$MUSIC_ROOT"

step "6. systemd"
install -m 644 "$SRC/systemd/hopzz-music.service" /etc/systemd/system/hopzz-music.service
systemctl daemon-reload
systemctl enable hopzz-music >/dev/null
systemctl restart hopzz-music
sleep 2
systemctl is-active --quiet hopzz-music || { echo "启动失败："; journalctl -u hopzz-music -n 40 --no-pager; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:8104/api/health && echo

step "7. 证书"
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  cat > /etc/nginx/sites-available/_acme-music.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
  ln -sf /etc/nginx/sites-available/_acme-music.conf /etc/nginx/sites-enabled/_acme-music.conf
  nginx -t && systemctl reload nginx
  command -v certbot >/dev/null || apt-get -y install certbot >/dev/null
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || true
  rm -f /etc/nginx/sites-enabled/_acme-music.conf /etc/nginx/sites-available/_acme-music.conf
else
  echo "证书已存在"
fi

step "8. nginx 站点"
install -m 644 "$SRC/nginx/music.hopzz.top.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
nginx -t
systemctl reload nginx

step "9. 验证"
c1=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || echo ERR)
c2=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || echo ERR)
echo "首页 $c1   接口 $c2"
echo
echo "========== 完成 =========="
echo "曲库目录：$MUSIC_ROOT"
echo "播放地址：https://$DOMAIN/player/<曲目ID>/"

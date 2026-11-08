#!/bin/bash
# =====================================================================
# 部署 studio.hopzz.top（Debian 12）
# 用法：bash install_studio.sh
# 幂等，可重复执行；已有 .env / 密码 / 项目不会被动
# =====================================================================
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
APP="/opt/hopzz-studio"
ROOT_DIR="/srv/files/工作站"
ACME="/var/www/certbot"
DOMAIN="studio.hopzz.top"

step() { echo; echo "========== $* =========="; }

[[ $EUID -eq 0 ]] || { echo "需要 root"; exit 1; }
command -v nginx >/dev/null || { echo "没装 nginx"; exit 1; }

step "0. 目标：$DOMAIN"

step "1. 目录"
mkdir -p "$APP/server" "$APP/static" "$APP/data" "$ACME"
mkdir -p "$ROOT_DIR"
echo "仓库根目录：$ROOT_DIR"

step "2. 同步代码"
rsync -a --exclude '__pycache__' "$SRC/server/" "$APP/server/"
[ -d "$SRC/static" ] && rsync -a "$SRC/static/" "$APP/static/"
echo "已同步到 $APP"

step "3. 环境配置（只生成一次）"
if [[ ! -f "$APP/.env" ]]; then
  cat > "$APP/.env" <<EOF
COOKIE_SECRET=$(openssl rand -hex 32)
DB_PATH=$APP/data/studio.db
STATIC_DIR=$APP/static
STUDIO_ROOT=$ROOT_DIR
EOF
  chmod 640 "$APP/.env"
  chown root:www-data "$APP/.env"
  echo "已生成 COOKIE_SECRET（密码留空 → 首次打开网页设置）"
else
  echo "配置已存在，保留"
fi

step "4. Python 依赖"
python3 -c 'import ensurepip' >/dev/null 2>&1 || apt-get -y install python3-venv python3-pip >/dev/null 2>&1 || true
if [[ -x "$APP/venv/bin/python" ]] && ! "$APP/venv/bin/python" -m pip --version >/dev/null 2>&1; then
  echo "现有 venv 缺 pip，重建"
  rm -rf "$APP/venv"
fi
if [[ ! -x "$APP/venv/bin/python" ]]; then
  python3 -m venv "$APP/venv" || {
    echo "venv 创建失败，改用系统 python"
    rm -rf "$APP/venv"; mkdir -p "$APP/venv/bin"
    ln -sf "$(command -v python3)" "$APP/venv/bin/python"
    ln -sf "$(command -v python3)" "$APP/venv/bin/python3"
  }
fi
"$APP/venv/bin/python" -m pip --version >/dev/null 2>&1 || "$APP/venv/bin/python" -m ensurepip --upgrade >/dev/null 2>&1 || true
PIPFLAGS=""
"$APP/venv/bin/python" -m pip --version >/dev/null 2>&1 || PIPFLAGS="--break-system-packages"
"$APP/venv/bin/python" -m pip install $PIPFLAGS --quiet --upgrade pip || true
"$APP/venv/bin/python" -m pip install $PIPFLAGS --quiet fastapi "uvicorn[standard]" python-multipart pillow

step "5. 权限"
chown -R www-data:www-data "$APP/data" "$APP/static" "$ROOT_DIR"
chmod 750 "$APP/data"
chmod 755 "$ROOT_DIR"

step "6. systemd"
install -m 644 "$SRC/systemd/hopzz-studio.service" /etc/systemd/system/hopzz-studio.service
systemctl daemon-reload
systemctl enable hopzz-studio >/dev/null
systemctl restart hopzz-studio
sleep 2
systemctl is-active --quiet hopzz-studio || { echo "启动失败："; journalctl -u hopzz-studio -n 40 --no-pager; exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:8103/api/health && echo

step "7. 证书"
if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  cat > /etc/nginx/sites-available/_acme-studio.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
EOF
  ln -sf /etc/nginx/sites-available/_acme-studio.conf /etc/nginx/sites-enabled/_acme-studio.conf
  nginx -t && systemctl reload nginx
  command -v certbot >/dev/null || apt-get -y install certbot >/dev/null
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || true
  rm -f /etc/nginx/sites-enabled/_acme-studio.conf /etc/nginx/sites-available/_acme-studio.conf
else
  echo "证书已存在"
fi

step "8. nginx 站点"
install -m 644 "$SRC/nginx/studio.hopzz.top.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
nginx -t
systemctl reload nginx

step "9. 验证"
c1=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || echo ERR)
c2=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || echo ERR)
echo "首页 $c1   接口 $c2"
echo
echo "========== 完成 =========="
echo "地址：https://$DOMAIN"
echo "仓库：$ROOT_DIR（网盘里同样可见）"
echo "首次打开会让你设置访问密码。"

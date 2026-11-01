#!/bin/bash
# =====================================================================
# hopzz.top 一键部署脚本（Debian 12）
# 前提：已经 scp 整个 deploy 目录到 /root/hopzz-deploy/
# 用 root 执行：bash /root/hopzz-deploy/install_server.sh
# 幂等：可重复执行。
# =====================================================================
set -euo pipefail

DOMAIN="hopzz.top"
WWW_DOMAIN="www.hopzz.top"
DEPLOY_SRC="/root/hopzz-deploy"
SITE_ROOT="/var/www/hopzz.top"
API_ROOT="/opt/hopzz-api"
ACME_ROOT="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

# ---------------------------------------------------------------- 0. 前置检查
step "0. 检查运行环境"
[[ $EUID -eq 0 ]] || { echo "必须以 root 运行"; exit 1; }
[[ -d "$DEPLOY_SRC" ]] || { echo "找不到 $DEPLOY_SRC"; exit 1; }
command -v nginx >/dev/null || { echo "nginx 未安装，先跑 setup_base.sh"; exit 1; }
command -v python3 >/dev/null || { echo "python3 未安装"; exit 1; }
echo "OK: root / nginx $(nginx -v 2>&1 | awk -F/ '{print $2}') / python $(python3 -V 2>&1 | awk '{print $2}')"

# ---------------------------------------------------------------- 1. 目录与静态站
step "1. 部署静态站点到 $SITE_ROOT"
mkdir -p "$SITE_ROOT" "$ACME_ROOT"
rsync -a --delete --exclude='.git' "$DEPLOY_SRC/site/" "$SITE_ROOT/"
chown -R www-data:www-data "$SITE_ROOT"
find "$SITE_ROOT" -type d -exec chmod 755 {} \;
find "$SITE_ROOT" -type f -exec chmod 644 {} \;
echo "静态文件清单："
find "$SITE_ROOT" -type f | sed "s|$SITE_ROOT|  |"

# ---------------------------------------------------------------- 2. 后端
step "2. 部署后端到 $API_ROOT"
mkdir -p "$API_ROOT/app" "$API_ROOT/data"
rsync -a --delete "$DEPLOY_SRC/api/" "$API_ROOT/app/"
# 只复制代码和依赖清单，requirements 放根目录
mv -f "$API_ROOT/app/requirements.txt" "$API_ROOT/requirements.txt"
touch "$API_ROOT/app/__init__.py"

# 设备令牌：只在第一次生成，之后保留（重装不会让硬件掉线）
if [[ ! -f "$API_ROOT/.env" ]]; then
  TOKEN="$(openssl rand -hex 24)"
  cat > "$API_ROOT/.env" <<EOF
DEVICE_TOKEN=$TOKEN
DB_PATH=$API_ROOT/data/hopzz.db
EOF
  chmod 600 "$API_ROOT/.env"
  echo "已生成新的设备令牌（见 $API_ROOT/.env）"
else
  echo "设备令牌已存在，保持不变"
fi

# 虚拟环境 + 依赖
if [[ ! -x "$API_ROOT/venv/bin/python" ]]; then
  echo "创建 venv..."
  python3 -m venv "$API_ROOT/venv"
fi
"$API_ROOT/venv/bin/pip" install --quiet --upgrade pip wheel
"$API_ROOT/venv/bin/pip" install --quiet -r "$API_ROOT/requirements.txt"
echo "已安装 Python 依赖："
"$API_ROOT/venv/bin/pip" list --format=freeze | grep -Ei '^(fastapi|uvicorn|pydantic|starlette)' || true

chown -R www-data:www-data "$API_ROOT/data"
chmod 750 "$API_ROOT/data"

# ---------------------------------------------------------------- 3. systemd
step "3. 安装并启动 systemd 服务"
install -m 644 "$DEPLOY_SRC/systemd/hopzz-api.service" /etc/systemd/system/hopzz-api.service
systemctl daemon-reload
systemctl enable hopzz-api >/dev/null
systemctl restart hopzz-api
sleep 2
systemctl is-active --quiet hopzz-api && echo "hopzz-api 已运行" || {
  echo "!! 服务启动失败，最近日志："
  journalctl -u hopzz-api -n 30 --no-pager
  exit 1
}
echo "--- 本机直连测试 ---"
curl -fsS --max-time 5 http://127.0.0.1:8000/api/health && echo

# ---------------------------------------------------------------- 4. Nginx 先跑 HTTP
step "4. 先用 HTTP 起站点（给证书验证用）"
rm -f /etc/nginx/sites-enabled/default
cat > /etc/nginx/sites-available/hopzz.top.http.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW_DOMAIN;
    location /.well-known/acme-challenge/ { root $ACME_ROOT; }
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / { root $SITE_ROOT; index index.html; try_files \$uri \$uri/ /index.html; }
}
EOF
ln -sf /etc/nginx/sites-available/hopzz.top.http.conf /etc/nginx/sites-enabled/hopzz.top.conf
nginx -t
systemctl reload nginx
echo "--- 通过 HTTP 测试 ---"
curl -fsS --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/api/health && echo

# ---------------------------------------------------------------- 5. 证书
step "5. 申请 Let's Encrypt 证书"
if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  echo "证书已存在，跳过申请"
else
  apt-get -y install certbot >/dev/null
  certbot certonly --webroot -w "$ACME_ROOT" \
    -d "$DOMAIN" -d "$WWW_DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --keep-until-expiring
fi
ls -l "/etc/letsencrypt/live/$DOMAIN/" || { echo "证书没拿到，先停在 HTTP 状态"; exit 2; }

# ---------------------------------------------------------------- 6. 切到 HTTPS
step "6. 切换到 HTTPS 配置"
install -m 644 "$DEPLOY_SRC/nginx/hopzz.top.conf" /etc/nginx/sites-available/hopzz.top.conf
ln -sf /etc/nginx/sites-available/hopzz.top.conf /etc/nginx/sites-enabled/hopzz.top.conf
rm -f /etc/nginx/sites-available/hopzz.top.http.conf
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------- 7. 续期
step "7. 确认自动续期"
systemctl enable --now certbot.timer 2>/dev/null || true
systemctl list-timers certbot.timer --no-pager 2>/dev/null || true

# ---------------------------------------------------------------- 8. 验证
step "8. 最终验证"
for u in "https://$DOMAIN/api/health" "https://$WWW_DOMAIN/api/status" "https://$DOMAIN/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$u" || echo "ERR")
  echo "  $code  $u"
done

echo
echo "========== 部署完成 =========="
echo "站点:   https://$DOMAIN"
echo "接口文档: https://$DOMAIN/api/docs"
echo "设备令牌: $(grep -o 'DEVICE_TOKEN=.*' "$API_ROOT/.env" | cut -d= -f2)"

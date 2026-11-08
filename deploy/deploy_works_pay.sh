#!/bin/bash
# 部署主站改动（作品列表 + 支付二维码）与 studio 发布接口
set -euo pipefail
echo "=== 1. 安装 qrcode 依赖 ==="
/opt/hopzz-api/venv/bin/pip install --quiet "qrcode[pil]" && echo "  已安装 qrcode[pil]"

echo
echo "=== 2. 同步主站后端 ==="
rsync -a /root/site-deploy/api/ /opt/hopzz-api/app/
chown -R root:root /opt/hopzz-api/app

echo
echo "=== 3. 同步主站前端 ==="
rsync -a --delete /root/site-deploy/site/ /var/www/hopzz.top/
chown -R www-data:www-data /var/www/hopzz.top

echo
echo "=== 4. 重启 hopzz-api ==="
systemctl restart hopzz-api
sleep 2
systemctl is-active hopzz-api

echo
echo "=== 5. 验证 /api/works ==="
curl -s http://127.0.0.1:8000/api/works | head -c 200; echo

echo
echo "=== 6. 验证二维码接口 ==="
curl -s -o /tmp/qr.png -w "  HTTP %{http_code}  类型 %{content_type}  大小 %{size_download}\n" \
  "http://127.0.0.1:8000/api/sponsor/qr?data=https%3A%2F%2Fexample.com%2Fpay"
file /tmp/qr.png 2>/dev/null | sed 's/^/  /'

echo
echo "=== 7. 同步 studio（发布接口） ==="
rsync -a --exclude '__pycache__' /root/studio-deploy/server/ /opt/hopzz-studio/server/
chown -R root:root /opt/hopzz-studio/server
systemctl restart hopzz-studio
sleep 1
systemctl is-active hopzz-studio
curl -s http://127.0.0.1:8103/api/health; echo

#!/bin/bash
# 给所有站点加 HSTS + 把「用 IP 或未知域名访问」统一导到 hopzz.top
set -euo pipefail

echo "=== 1. 给每个 443 server 块插入 HSTS ==="
changed=0
for f in /etc/nginx/sites-available/*.conf; do
  [ -f "$f" ] || continue
  if grep -q 'Strict-Transport-Security' "$f"; then
    echo "  跳过（已有）: $(basename "$f")"
    continue
  fi
  # 在 ssl_protocols 那一行后面插入
  if grep -q 'ssl_protocols' "$f"; then
    sed -i '/ssl_protocols/a\    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' "$f"
    echo "  已插入: $(basename "$f")"
    changed=$((changed+1))
  fi
done
echo "  共修改 $changed 个文件"

echo
echo "=== 2. 默认站点：未知主机名/IP 的 80 请求导到 hopzz.top ==="
cat > /etc/nginx/sites-available/000-default-redirect.conf <<'EOF'
# 兜底：任何没匹配到的 Host（包括直接用 IP 访问）都导到主站
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://hopzz.top$request_uri;
    }
}
EOF
ln -sf /etc/nginx/sites-available/000-default-redirect.conf /etc/nginx/sites-enabled/000-default-redirect.conf

echo
echo "=== 3. 检查并重载 ==="
nginx -t
systemctl reload nginx

echo
echo "=== 4. 验证 HSTS ==="
for d in hopzz.top ai.hopzz.top f.hopzz.top git.hopzz.top; do
  printf '%-16s %s\n' "$d" "$(curl -sI "https://$d/" | grep -i strict-transport | tr -d '\r' || echo '缺失')"
done

echo
echo "=== 5. IP 访问（http）==="
curl -sI http://64.83.20.24/ | head -3

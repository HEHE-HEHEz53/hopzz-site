#!/bin/bash
# 把站点从 chat.hopzz.top 迁到 ai.hopzz.top（鲸鱼娘在线）
set -euo pipefail

DOMAIN="ai.hopzz.top"
OLD="chat.hopzz.top"
SRC="/root/chat-deploy"
ACME="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

step "1. 申请 $DOMAIN 证书"
if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  echo "证书已存在，跳过"
else
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi
ls -d "/etc/letsencrypt/live/$DOMAIN" >/dev/null || { echo "证书没拿到"; exit 1; }

step "2. 安装新站点配置"
install -m 644 "$SRC/nginx/ai.hopzz.top.conf" /etc/nginx/sites-available/ai.hopzz.top.conf
ln -sf /etc/nginx/sites-available/ai.hopzz.top.conf /etc/nginx/sites-enabled/ai.hopzz.top.conf

install -m 644 "$SRC/nginx/chat-redirect.conf" /etc/nginx/sites-available/chat.hopzz.top.conf
ln -sf /etc/nginx/sites-available/chat.hopzz.top.conf /etc/nginx/sites-enabled/chat.hopzz.top.conf

nginx -t
systemctl reload nginx

step "3. 验证"
c1=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")
c2=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/me")
c3=$(curl -s -o /dev/null -w '%{http_code}' "https://$OLD/")
c4=$(curl -s -o /dev/null -w '%{redirect_url}' "https://$OLD/")
echo "https://$DOMAIN/          -> $c1"
echo "https://$DOMAIN/api/me    -> $c2 (401 正常)"
echo "https://$OLD/             -> $c3 -> $c4"
echo
echo "证书："
certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || true

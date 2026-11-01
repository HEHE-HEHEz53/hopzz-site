#!/bin/bash
set -euo pipefail
SRC=/root/chat-deploy
install -m 644 "$SRC/nginx/chat-redirect.conf" /etc/nginx/sites-available/chat.hopzz.top.conf
install -m 644 "$SRC/nginx/ai.hopzz.top.conf" /etc/nginx/sites-available/ai.hopzz.top.conf
ln -sf /etc/nginx/sites-available/chat.hopzz.top.conf /etc/nginx/sites-enabled/chat.hopzz.top.conf
ln -sf /etc/nginx/sites-available/ai.hopzz.top.conf /etc/nginx/sites-enabled/ai.hopzz.top.conf
nginx -t
systemctl reload nginx
echo
for d in ai.hopzz.top chat.hopzz.top; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$d/")
  api=$(curl -s -o /dev/null -w '%{http_code}' "https://$d/api/me")
  echo "$d  页面=$code  接口=$api"
done

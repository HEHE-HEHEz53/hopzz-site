#!/bin/bash
B=https://studio.hopzz.top
echo "=== 修复前 ==="
for p in "/api/projects" "/api/projects/" "/api/projects/abc" "/api/projects?type=music" "/api/modules"; do
  code=$(curl -s -o /tmp/r.txt -w '%{http_code}' "$B$p")
  loc=$(curl -s -o /dev/null -D - "$B$p" 2>/dev/null | grep -i '^location:' | tr -d '\r')
  printf '  %-26s %s  %s  %s\n' "$p" "$code" "$loc" "$(head -c 60 /tmp/r.txt | tr -d '\n')"
done

echo
echo "=== 应用 nginx 修复 ==="
CONF=/etc/nginx/sites-available/studio.hopzz.top.conf
cp "$CONF" "/root/studio.nginx.bak.$(date +%s)"
sed -i 's|location /api/projects/ {|location ^~ /api/projects {|' "$CONF"
grep -n 'location .*api' "$CONF"
nginx -t && systemctl reload nginx && echo "  已 reload"

echo
echo "=== 修复后 ==="
for p in "/api/projects" "/api/projects/" "/api/projects/abc" "/api/projects?type=music" "/api/modules" "/api/ai/sessions"; do
  code=$(curl -s -o /tmp/r2.txt -w '%{http_code}' "$B$p")
  loc=$(curl -s -o /dev/null -D - "$B$p" 2>/dev/null | grep -i '^location:' | tr -d '\r')
  printf '  %-26s %s  %s  %s\n' "$p" "$code" "$loc" "$(head -c 60 /tmp/r2.txt | tr -d '\n')"
done

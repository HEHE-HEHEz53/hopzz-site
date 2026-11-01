#!/bin/bash
set -euo pipefail
D=/opt/hopzz-chat/static
echo "=== 同步 v10 ==="
rsync -a --delete /tmp/chat-static10/ "$D"/
chown -R www-data:www-data "$D"
ls -l "$D"/app.js "$D"/index.html "$D"/app.css

echo
echo "=== 版本 ==="
grep -o 'app\.js?v=[0-9]*' "$D"/index.html
grep -o 'app\.css?v=[0-9]*' "$D"/index.html

echo
echo "=== 三级菜单痕迹 ==="
for k in breadcrumb '‹ 返回' panelView '设置 ›'; do
  printf '  %-12s %s\n' "$k" "$(grep -c "$k" "$D"/app.js "$D"/index.html 2>/dev/null | awk -F: '{s+=$2} END {print s}')"
done

echo
echo "=== 线上状态 ==="
for u in https://ai.hopzz.top/ 'https://ai.hopzz.top/app.js?v=10' 'https://ai.hopzz.top/app.css?v=10' https://ai.hopzz.top/api/setup-state; do
  printf '  %-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done

echo
echo "=== 插件连接 ==="
curl -s --max-time 8 http://127.0.0.1:8100/api/setup-state >/dev/null 2>&1 && echo "本地服务 OK"

#!/bin/bash
set -euo pipefail
echo "=== 部署 v7 前端 ==="
rsync -a --delete /tmp/chat-static7/ /opt/hopzz-chat/static/
chown -R www-data:www-data /opt/hopzz-chat/static
ls -l /opt/hopzz-chat/static | head -12

echo
echo "=== 资源可达性 ==="
for f in / 'app.js?v=7' 'app.css?v=7' avatar.jpg icon.png bg-desktop.jpg; do
  printf '  %-20s %s\n' "$f" "$(curl -s -o /dev/null -w '%{http_code}' "https://ai.hopzz.top/$f")"
done

echo
echo "=== 页面元素 ==="
curl -s https://ai.hopzz.top/ -o /tmp/chat.html
for k in setupView setupForm setupPassword setupConfirm connServerUrl connToken connString; do
  printf '  %-16s %s\n' "$k" "$(grep -c "id=\"$k\"" /tmp/chat.html)"
done

echo
echo "=== 接口 ==="
printf '  setup-state  %s\n' "$(curl -s https://ai.hopzz.top/api/setup-state)"
printf '  conninfo(未登录)  HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/api/conninfo)"

echo
echo "=== HSTS ==="
curl -sI https://ai.hopzz.top/ | grep -i strict-transport | tr -d '\r'

echo
echo "=== 服务日志（近 3 分钟错误）==="
journalctl -u hopzz-chat --since "-3 min" --no-pager 2>/dev/null | grep -E 'ERROR|Traceback' | tail -3 || echo "  无"

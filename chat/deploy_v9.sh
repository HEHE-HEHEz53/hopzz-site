#!/bin/bash
set -euo pipefail
D=/opt/hopzz-chat/static
echo "=== 同步 ==="
rsync -a --delete /tmp/chat-static9/ "$D"/
chown -R www-data:www-data "$D"
ls -l "$D"/app.js "$D"/index.html

echo
echo "=== 版本 ==="
grep -o 'app\.js?v=[0-9]*' "$D"/index.html
grep -o 'app\.css?v=[0-9]*' "$D"/index.html

echo
echo "=== 内容检查 ==="
for k in 'HEHEz53' 'DeepSeek（鲸鱼娘）' 'aria-expanded'; do
  printf '  %-18s %s\n' "$k" "$(grep -c "$k" "$D"/app.js "$D"/index.html 2>/dev/null | awk -F: '{s+=$2} END {print s}')"
done

echo
echo "=== 线上 ==="
for u in https://ai.hopzz.top/ 'https://ai.hopzz.top/app.js?v=9' 'https://ai.hopzz.top/app.css?v=9' https://ai.hopzz.top/api/setup-state; do
  printf '  %-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done

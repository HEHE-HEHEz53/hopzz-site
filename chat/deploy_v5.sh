#!/bin/bash
echo "=== 部署前端 ==="
if [ -d /tmp/static5 ]; then
  rsync -a --delete /tmp/static5/ /opt/hopzz-chat/static/
  rm -rf /tmp/static5
  echo "已同步"
fi
chown -R www-data:www-data /opt/hopzz-chat/static
ls -l /opt/hopzz-chat/static
echo
echo "=== 版本标记 ==="
grep -c 'app.js?v=5' /opt/hopzz-chat/static/index.html
grep -c 'app.css?v=5' /opt/hopzz-chat/static/index.html
echo
echo "=== 站名出现次数 ==="
grep -o '鲸鱼娘在线' /opt/hopzz-chat/static/index.html | wc -l
echo
echo "=== HTTP 状态 ==="
for u in "https://ai.hopzz.top/" "https://ai.hopzz.top/app.js?v=5" "https://ai.hopzz.top/app.css?v=5" "https://ai.hopzz.top/api/me" "https://chat.hopzz.top/"; do
  printf '%-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done

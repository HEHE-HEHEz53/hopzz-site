#!/bin/bash
# 部署鲸鱼娘在线前端（含头像/图标）
set -euo pipefail
SRC=/tmp/static6
DST=/opt/hopzz-chat/static

echo "=== 同步文件 ==="
rsync -a --delete "$SRC"/ "$DST"/
chown -R www-data:www-data "$DST"
ls -l "$DST"

echo
echo "=== 资源可达性 ==="
for f in / index.html 'app.js?v=6' 'app.css?v=6' avatar.jpg icon.png favicon.ico apple-touch-icon.png; do
  printf '%-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://ai.hopzz.top/$f")" "/$f"
done

echo
echo "=== 页面里引用了头像吗 ==="
grep -c 'avatar.jpg' "$DST/index.html"
grep -c '鲸鱼娘在线' "$DST/index.html"
grep -c 'icon.png' "$DST/index.html"

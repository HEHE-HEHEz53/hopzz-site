#!/bin/bash
set -euo pipefail
SRC=/tmp/site-deploy
DST=/var/www/hopzz.top

echo "=== 同步主页文件 ==="
rsync -a --delete "$SRC"/ "$DST"/
chown -R www-data:www-data "$DST"
find "$DST" -type d -exec chmod 755 {} \;
find "$DST" -type f -exec chmod 644 {} \;
ls -l "$DST"
echo
echo "=== 资源可达性 ==="
for f in index.html assets/style.css "assets/style.css?v=2" "assets/app.js?v=2" assets/whale-girl.jpg assets/bg-desktop.jpg assets/bg-mobile.jpg assets/avatar.jpg; do
  printf '%-6s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://hopzz.top/$f")" "/$f"
done
echo
echo "=== 首页内容检查 ==="
curl -s https://hopzz.top/ -o /tmp/home.html
echo "字节数: $(wc -c < /tmp/home.html)"
echo "插画背景: $(grep -c 'bg-desktop.jpg' /tmp/home.html)"
echo "邮箱:     $(grep -c 'hehez53@foxmail.com' /tmp/home.html)"
echo "QQ链接:   $(grep -c 'qm.qq.com' /tmp/home.html)"
echo "鲸鱼图:   $(grep -c 'whale-girl.jpg' /tmp/home.html)"
echo
echo "=== 接口 ==="
printf 'status    %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://hopzz.top/api/status)"
printf 'telemetry %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://hopzz.top/api/telemetry/latest)"

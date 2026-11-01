#!/bin/bash
echo "=== 部署静态文件 ==="
mkdir -p /tmp/static_in
if [ -d /tmp/static4 ]; then
  rsync -a --delete /tmp/static4/ /opt/hopzz-chat/static/
  rm -rf /tmp/static4
  echo "已从 /tmp/static4 同步"
fi
chown -R www-data:www-data /opt/hopzz-chat/static
ls -l /opt/hopzz-chat/static
echo
echo "=== 版本标记 ==="
grep -c 'app.js?v=4' /opt/hopzz-chat/static/index.html
grep -c 'app.css?v=4' /opt/hopzz-chat/static/index.html
echo
echo "=== HTTP 状态 ==="
c1=$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/)
c2=$(curl -s -o /dev/null -w '%{http_code}' 'https://ai.hopzz.top/app.js?v=4')
c3=$(curl -s -o /dev/null -w '%{http_code}' 'https://ai.hopzz.top/app.css?v=4')
c4=$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/api/me)
echo "页面       $c1"
echo "app.js     $c2"
echo "app.css    $c3"
echo "api/me     $c4 (401 正常)"
echo
echo "=== 页面里的关键元素 ==="
for k in sessionList projectList newSessionBtn infoPanel createModal settingsModal; do
  n=$(grep -c "id=\"$k\"" /opt/hopzz-chat/static/index.html)
  echo "$k: $n"
done
echo
echo "=== 插件连接 ==="
journalctl -u hopzz-chat --since "-30 min" --no-pager 2>/dev/null | grep '插件已连接' | tail -2

#!/bin/bash
D=/opt/hopzz-chat/static
echo "=== 文件 ==="
ls -l $D/app.js $D/index.html $D/app.css
echo
echo "=== 新功能关键词 ==="
for k in installPlugin removePlugin pluginSpecInput pluginList onInstallPlugin 插件管理; do
  printf '  %-16s %s\n' "$k" "$(grep -c "$k" $D/app.js $D/index.html 2>/dev/null | awk -F: '{s+=$2} END {print s}')"
done
echo
echo "=== 版本 ==="
grep -o 'app\.js?v=[0-9]*' $D/index.html
grep -o 'app\.css?v=[0-9]*' $D/index.html
echo
echo "=== 线上 ==="
printf '首页   %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/)"
printf 'js     %s\n' "$(curl -s -o /dev/null -w '%{http_code}' 'https://ai.hopzz.top/app.js?v=8')"
printf 'css    %s\n' "$(curl -s -o /dev/null -w '%{http_code}' 'https://ai.hopzz.top/app.css?v=8')"
printf 'setup  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/api/setup-state)"

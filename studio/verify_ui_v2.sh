#!/bin/bash
B=https://studio.hopzz.top
echo "=== 静态资源（v2）==="
curl -s "$B/" | grep -oE '(app\.css|app\.js|ai\.js|share-admin\.js)\?v=[0-9]+' | sort -u | sed 's/^/  /'
echo
printf '  index.html 里的主题脚本: %s\n' "$(curl -s $B/ | grep -c 'studio.settings')"
echo
echo "=== 关键接口（未登录应为 401，不再是 301）==="
for p in "/api/projects" "/api/modules" "/api/ai/sessions" "/api/health"; do
  printf '  %-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$B$p")"
done
echo
echo "=== 前端标记 ==="
printf '  app.js 含两级菜单标记:   %s\n' "$(curl -s $B/static/app.js | grep -c 'studio.settings.v1')"
printf '  app.js 含发布徽标:       %s\n' "$(curl -s $B/static/app.js | grep -c '已发布')"
printf '  ai.js 含浮窗:            %s\n' "$(curl -s $B/static/ai.js | grep -c 'sai-panel')"
printf '  share-admin 含 publish:  %s\n' "$(curl -s $B/static/share-admin.js | grep -c '/publish')"
printf '  旧字符图标残留:          %s\n' "$(curl -s $B/static/app.js | grep -c '⌘')"
echo
echo "=== 分享页回归 ==="
printf '  /ll/nope  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' $B/ll/nope)"
echo
echo "=== 服务 ==="
for s in hopzz-studio nginx hopzz-api; do printf '  %-14s %s\n' "$s" "$(systemctl is-active $s)"; done

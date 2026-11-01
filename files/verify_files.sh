#!/bin/bash
echo "=== 页面 ==="
code=$(curl -s -o /tmp/f.html -w '%{http_code}' https://f.hopzz.top/)
echo "首页 HTTP $code  字节 $(wc -c < /tmp/f.html)"
echo "标题: $(grep -o '<title>[^<]*</title>' /tmp/f.html)"
echo "站名命中: $(grep -c '鲸鱼娘网盘' /tmp/f.html)"
echo "静态资源:"
for f in 'app.css?v=1' 'app.js?v=1' icon.png avatar.jpg apple-touch-icon.png; do
  printf '  %-22s %s\n' "$f" "$(curl -s -o /dev/null -w '%{http_code}' "https://f.hopzz.top/$f")"
done
echo
echo "=== 页面关键元素 ==="
for k in loginView chooserView quickView netdiskView quickCard netdiskCard settingsBtn; do
  printf '  %-14s %s\n' "$k" "$(grep -c "id=\"$k\"" /tmp/f.html)"
done
echo
echo "=== 服务 ==="
systemctl is-active hopzz-files
du -sh /srv/files
echo
echo "=== 证书 ==="
certbot certificates 2>/dev/null | grep -A2 'f.hopzz.top' | head -4

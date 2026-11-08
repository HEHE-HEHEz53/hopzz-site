#!/bin/bash
echo "=== sites-enabled 指向 ==="
ls -l /etc/nginx/sites-enabled/ | grep studio
echo
echo "=== 配置文件全文 ==="
cat /etc/nginx/sites-available/studio.hopzz.top.conf
echo
echo "=== 其他可能匹配 studio 的 server_name ==="
grep -rn "studio.hopzz.top" /etc/nginx/ --include=*.conf | grep -v sites-available/studio
echo
echo "=== 直接打后端（绕过 nginx）==="
printf '  backend /api/projects      : '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8103/api/projects
printf '  backend /api/projects/     : '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8103/api/projects/
echo
echo "=== curl -i 看 301 的 server 头 ==="
curl -s -D - -o /dev/null https://studio.hopzz.top/api/projects | head -12

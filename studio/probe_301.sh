#!/bin/bash
B=https://studio.hopzz.top
echo "=== /api/projects 当前行为 ==="
curl -s -D - -o /tmp/body.txt "$B/api/projects" | head -12
echo "--- body ---"
head -c 200 /tmp/body.txt; echo
echo
echo "=== 带查询参数 ==="
curl -s -o /dev/null -w "  ?type=music  %{http_code}\n" "$B/api/projects?type=music"
echo
echo "=== 生效的 location 列表 ==="
nginx -T 2>/dev/null | awk '/server_name studio.hopzz.top/,/^}/' | grep -nE 'location|proxy_pass|try_files|return' | head -20
echo
echo "=== 后端直连 ==="
printf '  8103 /api/projects   : '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8103/api/projects
printf '  8103 /api/projects/  : '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8103/api/projects/
printf '  8103 /api/modules    : '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8103/api/modules

#!/bin/bash
set -euo pipefail

echo "=== 1. 重启服务 ==="
chown www-data:www-data /opt/hopzz-chat/server/app.py
systemctl restart hopzz-chat
sleep 2
systemctl is-active hopzz-chat

echo
echo "=== 2. 清掉我刚才测试失败留下的计数 ==="
sqlite3 /opt/hopzz-chat/data/chat.db <<'SQL'
UPDATE meta SET value='0' WHERE key IN ('fail_count','locked_until');
SQL
sqlite3 -header -column /opt/hopzz-chat/data/chat.db \
  "SELECT key, substr(value,1,18) AS value FROM meta WHERE key IN ('pwd_ver','fail_count','locked_until');"

echo
echo "=== 3. 接口形态 ==="
printf 'setup-state  HTTP %s  %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/api/setup-state)" \
  "$(curl -s https://ai.hopzz.top/api/setup-state)"
printf 'conninfo 未登录  HTTP %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/api/conninfo)"
printf '首页  HTTP %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/)"

echo
echo "=== 4. 最近的错误日志（应为空）==="
journalctl -u hopzz-chat --since "-2 min" --no-pager 2>/dev/null | grep -E 'ERROR|Traceback|NameError' | tail -5 || echo "  无"

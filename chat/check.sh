#!/bin/bash
echo "=== 当前 8100 连接 ==="
ss -tn 2>/dev/null | grep ':8100' | head -4 || echo "无连接"
echo
echo "=== 最近 40 分钟 agent-ws 事件 ==="
journalctl -u hopzz-chat --since "-40 min" --no-pager 2>/dev/null \
  | grep -E 'agent-ws|插件已连接|connection (open|closed)' | tail -8
echo
echo "=== 服务状态 ==="
for s in hopzz-chat hopzz-api nginx; do
  printf '%-12s %s\n' "$s" "$(systemctl is-active $s)"
done
echo
echo "=== 页面与接口 ==="
printf 'GET /                    -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://chat.hopzz.top/)"
printf 'GET /api/me (未登录)      -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://chat.hopzz.top/api/me)"
printf 'GET /api/conversations    -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://chat.hopzz.top/api/conversations)"
echo
echo "=== 数据库 ==="
sqlite3 -header -column /opt/hopzz-chat/data/chat.db \
  "SELECT (SELECT COUNT(*) FROM conversations) AS 对话数, (SELECT COUNT(*) FROM messages) AS 消息数;"
echo
echo "=== 锁定状态 ==="
sqlite3 -header -column /opt/hopzz-chat/data/chat.db \
  "SELECT key, value FROM meta WHERE key IN ('fail_count','locked_until','pwd_ver');"

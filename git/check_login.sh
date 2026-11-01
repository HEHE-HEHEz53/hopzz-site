#!/bin/bash
echo "=== 聊天站 ai.hopzz.top ==="
sqlite3 -header -column /opt/hopzz-chat/data/chat.db \
  "SELECT key, substr(value,1,26) AS value FROM meta ORDER BY key;"
echo
echo "--- 当前时间 / 锁定判断 ---"
date -u '+UTC %Y-%m-%d %H:%M:%S'
now=$(date +%s)
lock=$(sqlite3 /opt/hopzz-chat/data/chat.db "SELECT value FROM meta WHERE key='locked_until';")
echo "locked_until=$lock  now=$now  剩余=$((lock-now))秒"
echo
echo "--- setup 状态 ---"
curl -s https://ai.hopzz.top/api/setup-state; echo
echo "--- 首页 ---"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' https://ai.hopzz.top/

echo
echo "=== 网盘 f.hopzz.top ==="
sqlite3 -header -column /opt/hopzz-files/data/files.db \
  "SELECT key, substr(value,1,26) AS value FROM meta ORDER BY key;"
lock2=$(sqlite3 /opt/hopzz-files/data/files.db "SELECT value FROM meta WHERE key='locked_until';")
echo "locked_until=$lock2  剩余=$((lock2-now))秒"

echo
echo "=== 两个服务状态 ==="
for s in hopzz-chat hopzz-files nginx; do printf '%-14s %s\n' "$s" "$(systemctl is-active $s)"; done

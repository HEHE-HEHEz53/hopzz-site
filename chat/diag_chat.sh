#!/bin/bash
echo "=== 服务日志（最近 40 行）==="
journalctl -u hopzz-chat -n 40 --no-pager 2>/dev/null | tail -40
echo
echo "=== 数据库鉴权状态 ==="
sqlite3 -header -column /opt/hopzz-chat/data/chat.db \
  "SELECT key, substr(value,1,20) AS value FROM meta WHERE key IN ('pwd_hash','pwd_ver','fail_count','locked_until');"
echo
echo "=== .env 里的密码（只显示前 4 位）==="
grep '^CHAT_PASSWORD=' /opt/hopzz-chat/.env | cut -c1-20
echo
echo "=== 直接测本机登录 ==="
set -a; . /opt/hopzz-chat/.env; set +a
curl -s -o /tmp/login.json -w 'HTTP %{http_code}\n' -X POST http://127.0.0.1:8100/api/login \
  -H 'Content-Type: application/json' -d "{\"password\":\"$CHAT_PASSWORD\"}"
cat /tmp/login.json; echo

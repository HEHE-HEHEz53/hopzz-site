#!/bin/bash
echo "=== 最近的插件连接记录 ==="
journalctl -u hopzz-chat --since "-40 min" --no-pager 2>/dev/null | grep -E '插件已连接|agent-ws.*accepted|connection closed' | tail -12
echo
echo "=== 当前 8100 连接 ==="
ss -tn 2>/dev/null | grep ':8100' | head -6 || echo "无"
echo
echo "=== 域名状态 ==="
for d in ai.hopzz.top chat.hopzz.top; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$d/")
  echo "$d -> $code"
done

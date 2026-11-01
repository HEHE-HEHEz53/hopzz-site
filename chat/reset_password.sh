#!/bin/bash
# 清空网盘/聊天站的登录密码，让下次打开网站时重新「首次设置密码」
# 用法：bash /root/reset_chat_password.sh   （聊天站）
#       DB=/opt/hopzz-files/data/files.db bash /root/reset_chat_password.sh  （网盘）
set -euo pipefail

DB="${DB:-/opt/hopzz-chat/data/chat.db}"

if [ ! -f "$DB" ]; then
  echo "找不到数据库：$DB"
  exit 1
fi

echo "目标数据库: $DB"
echo "清空之前的密码状态："
sqlite3 -header -column "$DB" "SELECT key, substr(value,1,16) AS value FROM meta WHERE key IN ('pwd_hash','pwd_ver','fail_count','locked_until');" || true

sqlite3 "$DB" "DELETE FROM meta WHERE key IN ('pwd_hash','pwd_ver','fail_count','locked_until');"

echo
echo "已清空。下次打开网站会要求重新设置密码。"
echo "提示：设置完请立刻去设置，别让页面挂着不管。"

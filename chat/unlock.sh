#!/bin/bash
# 解除登录锁定（测试用 / 或者自己把自己锁了的时候用）
set -euo pipefail
DB=/opt/hopzz-chat/data/chat.db
sqlite3 "$DB" "UPDATE meta SET value='0' WHERE key='fail_count'; UPDATE meta SET value='0' WHERE key='locked_until';"
echo "已解锁。当前状态："
sqlite3 -header -column "$DB" "SELECT key, value FROM meta WHERE key IN ('fail_count','locked_until','pwd_ver');"

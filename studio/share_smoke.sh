#!/bin/bash
# 分享链接冒烟测试
set -uo pipefail
B="${BASE:-http://127.0.0.1:8103}"
J="/tmp/share-cookie.txt"
PASS="sharetest-$(openssl rand -hex 4)"
rm -f "$J"
say() { echo; echo "=== $* ==="; }

say "1. 首次设置密码（若已设置则跳过）"
NEED=$(curl -s "$B/api/setup-state" | python3 -c "import json,sys;print(json.load(sys.stdin)['needsSetup'])")
if [ "$NEED" = "True" ]; then
  curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}" >/dev/null
  echo "  已设置临时密码"
else
  echo "  已有密码，无法自动测试（跳过）"
  exit 0
fi

say "2. 建项目"
PID=$(curl -s -b "$J" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"分享测试","type":"music","summary":"公开链接测试","modules":["meta","lyrics"]}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['project']['id'])")
echo "  PID=$PID"
curl -s -b "$J" -X POST "$B/api/projects/$PID/mkdir" -H 'Content-Type: application/json' -d '{"path":"assets"}' >/dev/null
echo "歌词测试" > /tmp/lrc.txt
curl -s -b "$J" -X POST "$B/api/projects/$PID/upload?path=assets" -F "files=@/tmp/lrc.txt" >/dev/null

say "3. 开启分享（仅浏览）"
curl -s -b "$J" -X POST "$B/api/projects/$PID/share" -H 'Content-Type: application/json' \
  -d '{"slug":"smoke-share","mode":"view"}'; echo

say "4. 公开页 /ll/smoke-share"
curl -s -o /dev/null -w "  页面 %{http_code}\n" "$B/ll/smoke-share"
say "5. 公开 info"
curl -s "$B/ll/smoke-share/api/info" | head -c 260; echo
say "6. 公开 tree"
curl -s "$B/ll/smoke-share/api/tree" | head -c 300; echo
say "7. 公开文件下载"
curl -s "$B/ll/smoke-share/api/file?path=assets/lrc.txt"; echo
say "8. 只读模式下上传应 403"
curl -s -o /dev/null -w "  上传 %{http_code}\n" -X POST "$B/ll/smoke-share/api/upload?path=assets" -F "files=@/tmp/lrc.txt"
say "9. 切成可修改"
curl -s -b "$J" -X PATCH "$B/api/projects/$PID/share" -H 'Content-Type: application/json' -d '{"mode":"edit"}'; echo
echo "  再次上传:"; curl -s -X POST "$B/ll/smoke-share/api/upload?path=assets" -F "files=@/tmp/lrc.txt" | head -c 200; echo
say "10. 可修改模式下改字段"
curl -s -X PATCH "$B/ll/smoke-share/api/project" -H 'Content-Type: application/json' -d '{"summary":"通过公开链接改过"}'; echo
say "11. 关闭链接后应 404"
curl -s -b "$J" -X DELETE "$B/api/projects/$PID/share" >/dev/null
curl -s -o /dev/null -w "  页面 %{http_code}\n" "$B/ll/smoke-share"
curl -s -o /dev/null -w "  info   %{http_code}\n" "$B/ll/smoke-share/api/info"

say "12. 清理"
curl -s -b "$J" -X DELETE "$B/api/projects/$PID" >/dev/null
rm -rf "${STUDIO_ROOT:-/srv/files/工作站}/$PID"
python3 - <<'PY'
import sqlite3
import os; c = sqlite3.connect(os.environ.get('DB_PATH','/opt/hopzz-studio/data/studio.db'))
c.execute("DELETE FROM meta WHERE key IN ('pwd_hash','pwd_ver','fail_count','locked_until')")
c.commit()
print('  已清空临时密码')
PY
echo; echo "setup-state: $(curl -s "$B/api/setup-state")"

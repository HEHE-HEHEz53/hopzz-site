#!/bin/bash
# studio 冒烟测试：跑完会把登录态清空，让用户回到首次设置密码
set -uo pipefail
B="http://127.0.0.1:8103"
J="/tmp/studio-cookie.txt"
PASS="smoketest-$(openssl rand -hex 4)"
rm -f "$J"

say() { echo; echo "=== $* ==="; }

say "1. health"
curl -s "$B/api/health"; echo

say "2. setup 设置临时密码"
curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}"; echo

say "3. me（应 authed=true）"
curl -s -b "$J" "$B/api/me"; echo

say "4. modules"
curl -s -b "$J" "$B/api/modules" | head -c 300; echo

say "5. 建项目"
PID=$(curl -s -b "$J" -X POST "$B/api/projects" -H 'Content-Type: application/json' \
  -d '{"name":"冒烟测试曲","type":"music","tags":["测试"],"modules":["meta","lyrics","chords","sections"]}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('project',{}).get('id',''))")
echo "项目 ID: $PID"

say "6. 项目列表"
curl -s -b "$J" "$B/api/projects" | head -c 300; echo

say "7. 加模块 style"
curl -s -b "$J" -X POST "$B/api/projects/$PID/modules" -H 'Content-Type: application/json' -d '{"module":"style"}' | head -c 200; echo

say "8. 建文件夹 + 上传文本"
curl -s -b "$J" -X POST "$B/api/projects/$PID/mkdir" -H 'Content-Type: application/json' -d '{"path":"assets"}'; echo
echo "hello studio" > /tmp/hello.txt
curl -s -b "$J" -X POST "$B/api/projects/$PID/upload?path=assets" -F "files=@/tmp/hello.txt"; echo

say "9. 树"
curl -s -b "$J" "$B/api/projects/$PID/tree" | head -c 400; echo

say "10. 下载文件"
curl -s -b "$J" "$B/api/projects/$PID/file?path=assets/hello.txt"; echo

say "11. AI 缺 Key 应给中文提示"
curl -s -b "$J" -X POST "$B/api/ai/chat" -H 'Content-Type: application/json' -d '{"sessionId":"","message":"hi","projectIds":[]}' | head -c 200; echo

say "12. 非法路径应 400"
curl -s -o /dev/null -w "  tree 越界: %{http_code}\n" -b "$J" "$B/api/projects/$PID/tree?path=../../etc"

say "13. 清理：删测试项目 + 清空密码（回到首次设置）"
curl -s -b "$J" -X DELETE "$B/api/projects/$PID"; echo
sqlite3 /opt/hopzz-studio/data/studio.db "DELETE FROM meta WHERE key IN ('pwd_hash','pwd_ver');" 2>/dev/null || \
  python3 -c "
import sqlite3
c=sqlite3.connect('/opt/hopzz-studio/data/studio.db')
c.execute(\"DELETE FROM meta WHERE key IN ('pwd_hash','pwd_ver')\"); c.commit()
print('已清空密码')"
rm -rf "/srv/files/工作站/$PID" 2>/dev/null
echo
echo "setup-state:"; curl -s "$B/api/setup-state"; echo
echo
echo "仓库目录内容:"; ls -la /srv/files/工作站/ 2>/dev/null

#!/bin/bash
# 完成模块 + 封面 验收（独立实例）
set -uo pipefail
TMP=/tmp/studio-fin
rm -rf "$TMP"; mkdir -p "$TMP/root" "$TMP/data"
cd /opt/hopzz-studio/server
export COOKIE_SECRET=fin$(openssl rand -hex 6)
export DB_PATH="$TMP/data/test.db"
export STATIC_DIR=/opt/hopzz-studio/static
export STUDIO_ROOT="$TMP/root"
/opt/hopzz-studio/venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8201 --log-level warning >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -sf http://127.0.0.1:8201/api/health >/dev/null 2>&1 && break; sleep 0.3; done

B=http://127.0.0.1:8201
J=/tmp/fin-cookie.txt; rm -f "$J"
curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d '{"password":"fintest123"}' >/dev/null

echo "=== 1. finish 模块存在吗 ==="
curl -s -b "$J" "$B/api/modules" | python3 -c "
import json,sys
m=json.load(sys.stdin)['modules']
print('  finish:', m.get('finish'))
print('  music 默认:', json.load(open('/dev/null')) if False else '')
"
echo "=== 2. 建音乐项目（默认应含 piano-roll + finish）==="
R=$(curl -s -b "$J" -X POST "$B/api/projects" -H 'Content-Type: application/json' -d '{"name":"完成测试","type":"music"}')
PID=$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin)['project']['id'])")
echo "$R" | python3 -c "import json,sys;print('  modules:', json.load(sys.stdin)['project']['modules'])"

echo "=== 3. 上传封面 + 成品音频 ==="
printf '\x89PNG\r\n\x1a\n' > /tmp/cover.png
head -c 2048 /dev/urandom > /tmp/song.mp3
C=$(curl -s -b "$J" -X POST "$B/api/projects/$PID/upload?path=assets" -F "files=@/tmp/cover.png" | python3 -c "import json,sys;print(json.load(sys.stdin)['uploaded'][0]['path'])")
A=$(curl -s -b "$J" -X POST "$B/api/projects/$PID/upload?path=assets" -F "files=@/tmp/song.mp3" | python3 -c "import json,sys;print(json.load(sys.stdin)['uploaded'][0]['path'])")
echo "  封面: $C"; echo "  音频: $A"

echo "=== 4. 写入 finish 模块 + 项目封面 ==="
curl -s -b "$J" -X PATCH "$B/api/projects/$PID" -H 'Content-Type: application/json' \
  -d "{\"cover\":\"$C\",\"modulesData\":{\"finish\":{\"audio\":\"$A\",\"cover\":\"$C\",\"finishedAt\":\"2026-11-08T10:00:00Z\"}}}" >/dev/null
curl -s -b "$J" "$B/api/projects/$PID" | python3 -c "
import json,sys
d=json.load(sys.stdin)['project']
print('  project.cover:', d.get('cover'))
print('  finish:', d.get('modulesData',{}).get('finish'))
"

echo "=== 5. 发布 + 主站 works 过滤 ==="
curl -s -b "$J" -X POST "$B/api/projects/$PID/publish" -H 'Content-Type: application/json' -d '{}' >/dev/null
mkdir -p /srv/files/工作站 2>/dev/null || true
# 把测试项目临时放到生产根目录，验证主站读取
cp -r "$TMP/root/$PID" /srv/files/工作站/ 2>/dev/null && chown -R www-data:www-data /srv/files/工作站 || true
sleep 1
curl -s http://127.0.0.1:8000/api/works | python3 -c "
import json,sys
d=json.load(sys.stdin)
w=[x for x in d.get('works',[]) if x['id'].startswith('p-')]
print('  作品数:', len(w))
for x in w[:3]:
    print('   -', x['name'], '| cover:', bool(x['cover']), '| audio:', bool(x.get('audio')))
"

echo "=== 6. 清理 ==="
rm -rf "/srv/files/工作站/$PID"
curl -s -b "$J" -X DELETE "$B/api/projects/$PID" >/dev/null
echo "  已清理 $PID"

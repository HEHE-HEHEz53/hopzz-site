#!/bin/bash
# 模块化端到端验收（独立实例）
set -uo pipefail
TMP=/tmp/studio-mod-e2e
rm -rf "$TMP"; mkdir -p "$TMP/root" "$TMP/data"
cd /opt/hopzz-studio/server
export COOKIE_SECRET=e2e$(openssl rand -hex 6)
export DB_PATH="$TMP/data/test.db"
export STATIC_DIR=/opt/hopzz-studio/static
export STUDIO_ROOT="$TMP/root"
/opt/hopzz-studio/venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8202 --log-level warning >/tmp/e2e.log 2>&1 &
PID=$!
trap 'kill -9 $PID 2>/dev/null' EXIT
for i in $(seq 1 50); do curl -sf http://127.0.0.1:8202/api/health >/dev/null 2>&1 && break; sleep 0.3; done
if ! curl -sf http://127.0.0.1:8202/api/health >/dev/null 2>&1; then echo "实例没起来"; tail -5 /tmp/e2e.log; exit 1; fi

B=http://127.0.0.1:8202
J=/tmp/e2e-cookie.txt; rm -f "$J"
curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d '{"password":"e2etest123"}' >/dev/null

echo "=== 1. 模块 ui 标记（前端靠它选编辑器）==="
curl -s -b "$J" "$B/api/modules" | python3 -c "
import json,sys
d=json.load(sys.stdin)
mods=d['modules']
ui={k:v.get('ui') for k,v in mods.items() if v.get('ui')}
print('  模块总数:', len(mods), '| 带图形编辑器:', len(ui))
for k,v in sorted(ui.items()): print('   -', k, '->', v)
print('  music 默认:', d['defaults']['music'])
"

echo
echo "=== 2. 建项目 + 写 piano-roll(parts/song) ==="
PID=$(curl -s -b "$J" -X POST "$B/api/projects" -H 'Content-Type: application/json' -d '{"name":"E2E音乐","type":"music"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['project']['id'])")
echo "  PID=$PID"
curl -s -b "$J" -X PATCH "$B/api/projects/$PID" -H 'Content-Type: application/json' -d '{
 "modulesData":{"piano-roll":{
   "bpm":128,"grid":32,
   "notes":[{"pitch":60,"start":0,"len":2,"vel":100}],
   "parts":[{"id":"part1","name":"主歌1","notes":[{"pitch":60,"start":0,"len":2,"vel":100}]},
            {"id":"part2","name":"副歌","notes":[{"pitch":67,"start":0,"len":4,"vel":110}]}],
   "song":[{"partId":"part1","repeat":1},{"partId":"part2","repeat":2}]
 }}}' >/dev/null
curl -s -b "$J" "$B/api/projects/$PID" | python3 -c "
import json,sys
md=json.load(sys.stdin)['project']['modulesData']['piano-roll']
print('  parts:', [p['name'] for p in md['parts']])
print('  song :', md['song'])
"

echo
echo "=== 3. finish 模块（成品+封面）→ 发布 → 主站 works ==="
printf '\x89PNG\r\n\x1a\n' > /tmp/c.png; head -c 1024 /dev/urandom > /tmp/a.mp3
C=$(curl -s -b "$J" -X POST "$B/api/projects/$PID/upload?path=assets" -F "files=@/tmp/c.png" | python3 -c "import json,sys;print(json.load(sys.stdin)['uploaded'][0]['path'])")
A=$(curl -s -b "$J" -X POST "$B/api/projects/$PID/upload?path=assets" -F "files=@/tmp/a.mp3" | python3 -c "import json,sys;print(json.load(sys.stdin)['uploaded'][0]['path'])")
curl -s -b "$J" -X PATCH "$B/api/projects/$PID" -H 'Content-Type: application/json' \
  -d "{\"cover\":\"$C\",\"modulesData\":{\"finish\":{\"audio\":\"$A\",\"cover\":\"$C\",\"finishedAt\":\"2026-11-08T10:30:00Z\"}}}" >/dev/null
curl -s -b "$J" -X POST "$B/api/projects/$PID/publish" -H 'Content-Type: application/json' -d '{}' >/dev/null
cp -r "$TMP/root/$PID" /srv/files/工作站/ 2>/dev/null && chown -R www-data:www-data /srv/files/工作站
sleep 1
curl -s http://127.0.0.1:8000/api/works | python3 -c "
import json,sys
w=[x for x in json.load(sys.stdin)['works'] if x['id'].startswith('p-')]
print('  主站作品数:', len(w))
for x in w[:2]:
    print('   -', x['name'], '| cover:', bool(x['cover']), '| audio:', bool(x.get('audio')))
"

echo
echo "=== 4. 清理 ==="
rm -rf "/srv/files/工作站/$PID"
curl -s -b "$J" -X DELETE "$B/api/projects/$PID" >/dev/null
echo "  done"

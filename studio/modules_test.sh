#!/bin/bash
# 模块化能力验收（独立实例，不动生产库）
set -uo pipefail
TMP=/tmp/studio-mod-test
rm -rf "$TMP"; mkdir -p "$TMP/root" "$TMP/data"
cd /opt/hopzz-studio/server
export COOKIE_SECRET=mod$(openssl rand -hex 8)
export DB_PATH="$TMP/data/test.db"
export STATIC_DIR=/opt/hopzz-studio/static
export STUDIO_ROOT="$TMP/root"
/opt/hopzz-studio/venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8197 --log-level warning &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8197/api/health >/dev/null 2>&1 && break; sleep 0.3; done

B=http://127.0.0.1:8197
J=/tmp/mod-cookie.txt
rm -f "$J"
curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d '{"password":"modtest123"}' >/dev/null

echo "=== 1. 模块清单里的 ui 标记 ==="
curl -s -b "$J" "$B/api/modules" | python3 -c "
import json,sys
d=json.load(sys.stdin)
mods=d.get('modules',{})
ui=[(k,v.get('ui')) for k,v in mods.items() if v.get('ui')]
print('  模块总数:', len(mods))
print('  图形模块:', len(ui))
for k,v in ui: print('   -', k, '->', v)
print('  music 默认:', d.get('defaults',{}).get('music'))
"

echo
echo "=== 2. 建项目并写入 modulesData ==="
PID=$(curl -s -b "$J" -X POST "$B/api/projects" -H 'Content-Type: application/json' -d '{"name":"模块测试","type":"music"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['project']['id'])")
echo "  PID=$PID"
curl -s -b "$J" -X PATCH "$B/api/projects/$PID" -H 'Content-Type: application/json' -d '{"modulesData":{"piano-roll":{"bpm":128,"grid":32,"notes":[{"pitch":60,"start":0,"len":2,"vel":100},{"pitch":64,"start":2,"len":2,"vel":90}]}}}' | head -c 220; echo
echo "  读回:"
curl -s -b "$J" "$B/api/projects/$PID" | python3 -c "
import json,sys
d=json.load(sys.stdin)['project']
md=d.get('modulesData',{})
print('   modulesData keys:', list(md.keys()))
print('   notes 数:', len(md.get('piano-roll',{}).get('notes',[])))
"

echo
echo "=== 3. 合并语义（只改 bpm，notes 保留）==="
curl -s -b "$J" -X PATCH "$B/api/projects/$PID" -H 'Content-Type: application/json' -d '{"modulesData":{"piano-roll":{"bpm":140}}}' >/dev/null
curl -s -b "$J" "$B/api/projects/$PID" | python3 -c "
import json,sys
d=json.load(sys.stdin)['project']['modulesData']['piano-roll']
print('   bpm:', d.get('bpm'), '| notes:', len(d.get('notes',[])))
"

echo
echo "=== 4. 超限保护（>512KB 应 400）==="
python3 - <<'PY' > /tmp/big.json
import json
notes=[{"pitch":60,"start":i,"len":1,"vel":100,"pad":"x"*40} for i in range(6000)]
print(json.dumps({"modulesData":{"piano-roll":{"big":notes}}}))
PY
curl -s -o /dev/null -w "   大 payload: %{http_code}\n" -b "$J" -X PATCH "$B/api/projects/$PID" -H 'Content-Type: application/json' --data-binary @/tmp/big.json

echo
echo "=== 5. 清理 ==="
curl -s -b "$J" -X DELETE "$B/api/projects/$PID" >/dev/null
echo "  已删除测试项目"

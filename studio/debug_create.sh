#!/bin/bash
set -uo pipefail
TMP=/tmp/studio-dbg
rm -rf "$TMP"; mkdir -p "$TMP/root" "$TMP/data"
cd /opt/hopzz-studio/server
export COOKIE_SECRET=dbg$(openssl rand -hex 6)
export DB_PATH="$TMP/data/test.db"
export STATIC_DIR=/opt/hopzz-studio/static
export STUDIO_ROOT="$TMP/root"
/opt/hopzz-studio/venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8195 --log-level debug > /tmp/dbg.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -sf http://127.0.0.1:8195/api/health >/dev/null 2>&1 && break; sleep 0.3; done

B=http://127.0.0.1:8195
J=/tmp/dbg-cookie.txt; rm -f "$J"
echo "--- setup ---"
curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d '{"password":"dbgtest123"}'; echo
echo "--- create project（看状态码和 body）---"
curl -s -i -b "$J" -X POST "$B/api/projects" -H 'Content-Type: application/json' -d '{"name":"调试项目","type":"music"}' | head -30
echo
echo "--- 后端日志尾部 ---"
tail -25 /tmp/dbg.log

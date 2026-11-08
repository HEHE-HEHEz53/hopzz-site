#!/bin/bash
# 用独立实例（临时 DB / 临时根目录）验证分享功能，不碰生产数据
set -uo pipefail
TMP=/tmp/studio-share-test
rm -rf "$TMP"; mkdir -p "$TMP/root" "$TMP/data"
cd /opt/hopzz-studio/server

export COOKIE_SECRET=testsecret$(openssl rand -hex 8)
export DB_PATH="$TMP/data/test.db"
export STATIC_DIR=/opt/hopzz-studio/static
export STUDIO_ROOT="$TMP/root"

/opt/hopzz-studio/venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8199 --log-level warning &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:8199/api/health >/dev/null 2>&1 && break
  sleep 0.3
done

BASE=http://127.0.0.1:8199 bash /root/studio-deploy/share_smoke.sh

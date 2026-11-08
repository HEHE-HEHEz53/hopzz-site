#!/bin/bash
# studio 完整验收：独立实例跑 AI 相关接口 + 生产站静态资源检查
set -uo pipefail
TMP=/tmp/studio-final
rm -rf "$TMP"; mkdir -p "$TMP/root" "$TMP/data"
cd /opt/hopzz-studio/server
export COOKIE_SECRET=final$(openssl rand -hex 8)
export DB_PATH="$TMP/data/test.db"
export STATIC_DIR=/opt/hopzz-studio/static
export STUDIO_ROOT="$TMP/root"

/opt/hopzz-studio/venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8198 --log-level warning &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8198/api/health >/dev/null 2>&1 && break; sleep 0.3; done

B=http://127.0.0.1:8198
J=/tmp/final-cookie.txt
rm -f "$J"
say() { echo; echo "=== $* ==="; }

say "1. 首次设置密码"
curl -s -c "$J" -X POST "$B/api/setup" -H 'Content-Type: application/json' -d '{"password":"finaltest123"}' >/dev/null
curl -s -b "$J" "$B/api/me"; echo

say "2. AI 服务商列表（不含 Key）"
curl -s -b "$J" "$B/api/ai/providers" | head -c 400; echo

say "3. 缺 Key 时 chat 应中文 400"
curl -s -b "$J" -X POST "$B/api/ai/chat" -H 'Content-Type: application/json' -d '{"message":"你好","projectIds":[]}' | head -c 200; echo

say "4. 会话新建 / 列表 / 改名 / 删除"
SID=$(curl -s -b "$J" -X POST "$B/api/ai/sessions" -H 'Content-Type: application/json' -d '{"title":"验收会话"}' | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('session') or d.get('data') or {}).get('id',''))")
echo "  session=$SID"
curl -s -b "$J" "$B/api/ai/sessions" | head -c 200; echo
curl -s -b "$J" -X PATCH "$B/api/ai/sessions/$SID" -H 'Content-Type: application/json' -d '{"title":"改名后"}' | head -c 160; echo
curl -s -b "$J" -X DELETE "$B/api/ai/sessions/$SID" | head -c 120; echo

say "5. 模块清单数量"
curl -s -b "$J" "$B/api/modules" | python3 -c "import json,sys;d=json.load(sys.stdin);m=d.get('modules',{});print('  modules:',len(m));print('  defaults:',list((d.get('defaults') or {}).keys())[:9])"

say "6. 生产站静态资源"
for u in https://studio.hopzz.top/ \
         https://studio.hopzz.top/static/app.css \
         https://studio.hopzz.top/static/app.js \
         https://studio.hopzz.top/static/ai.js \
         https://studio.hopzz.top/static/share-admin.js \
         https://studio.hopzz.top/static/public.js \
         https://studio.hopzz.top/static/public.html; do
  printf '  %s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done

say "7. 主站"
for u in https://hopzz.top/ https://hopzz.top/api/sponsor/product; do
  printf '  %s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done

say "8. 服务状态"
for s in hopzz-api hopzz-chat hopzz-files hopzz-studio opcpay-bridge nginx; do
  printf '  %-16s %s\n' "$s" "$(systemctl is-active $s)"
done

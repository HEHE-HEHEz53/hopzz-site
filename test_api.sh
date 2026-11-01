#!/bin/bash
# API 自检脚本：验证设备上报链路是否正常
# 用法：bash test_api.sh
set -u

TOKEN="$(grep -o 'DEVICE_TOKEN=.*' /opt/hopzz-api/.env | cut -d= -f2)"
B="http://127.0.0.1:8000"
pass=0; fail=0
chk() { # chk <描述> <期望码> <实际码>
  if [[ "$2" == "$3" ]]; then echo "  [OK]   $1 (HTTP $3)"; pass=$((pass+1));
  else echo "  [FAIL] $1 期望 $2 实际 $3"; fail=$((fail+1)); fi
}

echo "=== 1. 正确令牌上报 ==="
body='{"device_id":"self-test","temperature":24.6,"humidity":51.3}'
code=$(curl -sS -o /tmp/r1.json -w '%{http_code}' -X POST "$B/api/telemetry" \
  -H 'Content-Type: application/json' -H "X-Device-Token: $TOKEN" -d "$body")
cat /tmp/r1.json; echo
chk "正确令牌" 200 "$code"

echo "=== 2. 错误令牌（应 401）==="
code=$(curl -sS -o /tmp/r2.json -w '%{http_code}' -X POST "$B/api/telemetry" \
  -H 'Content-Type: application/json' -H 'X-Device-Token: wrong-token' -d "$body")
cat /tmp/r2.json; echo
chk "错误令牌被拒" 401 "$code"

echo "=== 3. 完全不带令牌（应 401）==="
code=$(curl -sS -o /tmp/r3.json -w '%{http_code}' -X POST "$B/api/telemetry" \
  -H 'Content-Type: application/json' -d "$body")
cat /tmp/r3.json; echo
chk "缺令牌被拒" 401 "$code"

echo "=== 4. 没有任何测量值（应 422）==="
code=$(curl -sS -o /tmp/r4.json -w '%{http_code}' -X POST "$B/api/telemetry" \
  -H 'Content-Type: application/json' -H "X-Device-Token: $TOKEN" -d '{"device_id":"x"}')
cat /tmp/r4.json; echo
chk "空数据被拒" 422 "$code"

echo "=== 5. 读最新一条 ==="
curl -sS "$B/api/telemetry/latest"; echo

echo "=== 6. 读历史 5 条 ==="
curl -sS "$B/api/telemetry/history?limit=5"; echo

echo "=== 7. 访问计数 +1 ==="
curl -sS -X POST "$B/api/visit"; echo

echo
echo "结果：通过 $pass 项，失败 $fail 项"
[[ $fail -eq 0 ]] || exit 1

#!/bin/bash
# 定位 /api/stream 慢在哪
set -uo pipefail
TID=3f62b628-b19c-43b5-852f-11d58a5190e4
B=http://127.0.0.1:8104
J=/tmp/t.cookie; rm -f "$J"
curl -s -c "$J" -o /dev/null "$B/player/$TID/"
read -r TOKEN EXP <<< "$(curl -s -b "$J" "$B/api/track/$TID" | python3 -c "
import json,sys
s=json.load(sys.stdin)['track']['stream']
print(s['token'], s['exp'])")"

echo "=== curl 拉流耗时（直连 uvicorn）==="
/usr/bin/time -f "  耗时 %e 秒  大小 %s 字节" \
  curl -s -b "$J" -H "X-Music-Token: $TOKEN" -H "X-Music-Exp: $EXP" -o /tmp/s.bin "$B/api/stream/$TID"

echo
echo "=== curl 拉流耗时（经 nginx）==="
/usr/bin/time -f "  耗时 %e 秒" \
  curl -s -b "$J" -H "X-Music-Token: $TOKEN" -H "X-Music-Exp: $EXP" -o /tmp/s2.bin "https://music.hopzz.top/api/stream/$TID"

echo
echo "=== Python 异或两种写法对比 ==="
/opt/hopzz-music/venv/bin/python - <<'PY'
import time, os, hashlib, hmac
path = "/srv/music/3f62b628-b19c-43b5-852f-11d58a5190e4/audio.mp3"
body = open(path, "rb").read()
key = bytes.fromhex(hmac.new(b"x"*32, b"obf:test", hashlib.sha256).hexdigest()[:32])
print("  文件大小:", len(body), "字节")

t0 = time.time()
masked = bytes(b ^ key[i % len(key)] for i, b in enumerate(body))
print("  生成器写法: %.2f 秒" % (time.time() - t0))

t0 = time.time()
n = len(body)
k = (key * (n // len(key) + 1))[:n]
masked2 = (int.from_bytes(body, "big") ^ int.from_bytes(k, "big")).to_bytes(n, "big")
print("  大整数异或: %.3f 秒" % (time.time() - t0))
print("  两者结果一致:", masked == masked2)
PY

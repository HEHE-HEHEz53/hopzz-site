#!/bin/bash
# music v3.1 验收：流式播放 + 同源校验 + 直接打开被拒
set -uo pipefail
TID=3f62b628-b19c-43b5-852f-11d58a5190e4
B=https://music.hopzz.top
J=/tmp/v31.cookie; rm -f "$J"

echo "=== 1. 播放页 ==="
printf '  HTTP %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -c "$J" "$B/player/$TID/")"

echo
echo "=== 2. track 返回签名地址（无直链文件）==="
curl -s -b "$J" "$B/api/track/$TID" | python3 -c "
import json,sys
d=json.load(sys.stdin); t=d['track']
print('  audioUrl:', t.get('audioUrl','')[:90])
print('  expiresIn:', t.get('expiresIn'), '秒')
"
AUDIO=$(curl -s -b "$J" "$B/api/track/$TID" | python3 -c "import json,sys;print(json.load(sys.stdin)['track']['audioUrl'])")

echo
echo "=== 3. 直接打开（无 Referer / 无 Sec-Fetch-Site）→ 应 403 ==="
printf '  无任何来源头: %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B$AUDIO")"

echo
echo "=== 4. 伪装成同源请求（模拟 <audio> 发起）→ 应 200/206 ==="
printf '  Sec-Fetch-Site: same-origin → %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -H 'Sec-Fetch-Site: same-origin' "$B$AUDIO")"
printf '  Referer 同源               → %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -H "Referer: $B/player/$TID/" "$B$AUDIO")"
printf '  Range 前 1MB（同源）        → %s  %s 字节\n' \
  "$(curl -s -o /tmp/a.bin -w '%{http_code}' -b "$J" -H 'Sec-Fetch-Site: same-origin' -H 'Range: bytes=0-1048575' "$B$AUDIO")" \
  "$(stat -c %s /tmp/a.bin)"
printf '  HEAD（同源）               → %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -I -b "$J" -H 'Sec-Fetch-Site: same-origin' "$B$AUDIO")"

echo
echo "=== 5. 无 Cookie（只有 URL）→ 应 403 ==="
printf '  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -H 'Sec-Fetch-Site: same-origin' "$B$AUDIO")"

echo
echo "=== 6. 过期/伪造签名 → 应 403 ==="
printf '  伪造: %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -H 'Sec-Fetch-Site: same-origin' "$B/api/audio/$TID?exp=1&sig=bad")"

echo
echo "=== 7. 旧 /api/stream → 应 403 ==="
printf '  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/stream/$TID")"

echo
echo "=== 8. 文件头是否真 MP3（同源拿到的）==="
echo "  前 3 字节: $(od -An -tx1 -N3 /tmp/a.bin | tr -d ' ')  （49 44 33 = ID3）"

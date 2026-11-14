#!/bin/bash
# music v3 验收：会话 + 令牌 + 请求头 + 混淆 + 版权
set -uo pipefail
B=${BASE:-https://music.hopzz.top}
TID=3f62b628-b19c-43b5-852f-11d58a5190e4
J=/tmp/music-cookie.txt
rm -f "$J"

echo "=== 1. 播放页下发会话 Cookie ==="
curl -s -c "$J" -D /tmp/h.txt -o /dev/null "$B/player/$TID/"
grep -i 'set-cookie' /tmp/h.txt | sed 's/^/  /'
echo "  X-Copyright: $(grep -i 'x-copyright' /tmp/h.txt | tr -d '\r' | cut -d' ' -f2-)"

echo
echo "=== 2. 无会话访问 /api/track → 应 403 ==="
printf '  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$B/api/track/$TID")"

echo
echo "=== 3. 有会话拿令牌 ==="
curl -s -b "$J" "$B/api/track/$TID" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=d['track']
print('  版权:', d.get('copyright'))
print('  标题:', t['title'], '| 时长:', t['duration'])
print('  有直链吗:', 'audioUrl' in t)
print('  stream:', {k: (v[:12]+'…' if isinstance(v,str) and len(v)>12 else v) for k,v in t['stream'].items()})
" 

echo
echo "=== 4. 直接开旧音频地址 / 新流地址（无请求头）→ 应 403 ==="
printf '  /api/audio   %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/audio/$TID")"
printf '  /api/stream  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" "$B/api/stream/$TID")"

echo
echo "=== 5. 带令牌 + 请求头 → 200，且内容是混淆过的（不是 MP3） ==="
read -r TOKEN EXP <<< "$(curl -s -b "$J" "$B/api/track/$TID" | python3 -c "
import json,sys
s=json.load(sys.stdin)['track']['stream']
print(s['token'], s['exp'])")"
curl -s -b "$J" -H "X-Music-Token: $TOKEN" -H "X-Music-Exp: $EXP" -o /tmp/stream.bin -D /tmp/h2.txt "$B/api/stream/$TID"
echo "  HTTP: $(head -1 /tmp/h2.txt | tr -d '\r')"
echo "  大小: $(stat -c %s /tmp/stream.bin) 字节"
echo "  前 4 字节(hex): $(od -An -tx1 -N4 /tmp/stream.bin | tr -d " ")"
echo "  file 判定: $(file -b /tmp/stream.bin)"
echo "  响应头 X-Obfuscated: $(grep -i 'x-obfuscated' /tmp/h2.txt | tr -d '\r' | cut -d' ' -f2-)"

echo
echo "=== 6. 无 Cookie（只带令牌）→ 应 403 ==="
printf '  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -H "X-Music-Token: $TOKEN" -H "X-Music-Exp: $EXP" "$B/api/stream/$TID")"

echo
echo "=== 7. 伪造令牌 → 应 403 ==="
printf '  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -b "$J" -H "X-Music-Token: fake" -H "X-Music-Exp: $EXP" "$B/api/stream/$TID")"

echo
echo "=== 8. 版权接口 ==="
curl -s "$B/api/credits" | head -c 400; echo
echo
curl -s "$B/static/copyright.txt" | head -8 | sed 's/^/  /'

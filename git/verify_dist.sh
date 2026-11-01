#!/bin/bash
echo "=== 1. GitHub 仓库里有没有 dist 包 ==="
python3 - <<'PY'
import json, urllib.request
tok = open('/root/.gh_token').read().strip()
req = urllib.request.Request(
    'https://api.github.com/repos/HEHE-HEHEz53/hopzz-site/contents/dist',
    headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'dsh'})
try:
    data = json.load(urllib.request.urlopen(req, timeout=30))
    for f in data:
        print(f"  {f['name']}  {f['size']} 字节")
except Exception as e:
    print('  出错:', e)
PY
echo
echo "=== 2. raw 下载地址是否可下（从服务器测）==="
code=$(curl -sL -o /tmp/ghpkg.tgz -w '%{http_code}' https://raw.githubusercontent.com/HEHE-HEHEz53/hopzz-site/main/dist/dsh-web-relay-2.5.0.tgz)
echo "HTTP $code  大小 $(stat -c %s /tmp/ghpkg.tgz 2>/dev/null || echo 0) 字节"
tar -tzf /tmp/ghpkg.tgz 2>/dev/null | head -5
echo
echo "=== 3. 自建站点上的同一份包 ==="
code2=$(curl -s -o /tmp/ownpkg.tgz -w '%{http_code}' https://hopzz.top/dl/dsh-web-relay-2.5.0.tgz)
echo "HTTP $code2  大小 $(stat -c %s /tmp/ownpkg.tgz 2>/dev/null || echo 0) 字节"
echo
echo "=== 4. 两个文件是否一致 ==="
a=$(sha256sum /tmp/ghpkg.tgz 2>/dev/null | cut -d' ' -f1)
b=$(sha256sum /tmp/ownpkg.tgz 2>/dev/null | cut -d' ' -f1)
echo "github: ${a:-空}"
echo "自建:   ${b:-空}"
[ -n "$a" ] && [ "$a" = "$b" ] && echo "一致 ✓" || echo "不一致或有一方缺失"

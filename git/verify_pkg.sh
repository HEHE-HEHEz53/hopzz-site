#!/bin/bash
cd /tmp
rm -rf gh2 && mkdir gh2
curl -sL -o g.tgz https://raw.githubusercontent.com/HEHE-HEHEz53/hopzz-site/main/dist/dsh-web-relay-latest.tgz
tar -xzf g.tgz -C gh2 package/package.json
echo "=== GitHub dist/dsh-web-relay-latest.tgz ==="
python3 - <<'PY'
import json
d = json.load(open('/tmp/gh2/package/package.json'))
print("  version:", d["version"])
print("  描述:   ", d["description"])
print("  files:  ", d["files"])
PY
echo
echo "=== 自建站点 /dl/dsh-web-relay-latest.tgz ==="
curl -s -o own.tgz https://hopzz.top/dl/dsh-web-relay-latest.tgz
rm -rf ownx && mkdir ownx && tar -xzf own.tgz -C ownx package/package.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/ownx/package/package.json'))
print("  version:", d["version"])
print("  描述:   ", d["description"])
PY
echo
echo "=== 两个包是否一致 ==="
a=$(sha256sum g.tgz | cut -d' ' -f1)
b=$(sha256sum own.tgz | cut -d' ' -f1)
echo "  github: $a"
echo "  自建:   $b"
[ "$a" = "$b" ] && echo "  一致 ✓" || echo "  不一致 ✗"

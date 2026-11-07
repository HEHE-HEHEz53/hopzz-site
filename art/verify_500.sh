#!/bin/bash
echo "=== 1. 自建站点 latest 包 ==="
cd /tmp && rm -rf vv5 && mkdir vv5 && cd vv5
curl -sL -o a.tgz https://hopzz.top/dl/dsh-web-relay-latest.tgz
echo "  大小: $(stat -c %s a.tgz) 字节"
tar -xzf a.tgz package/package.json
python3 -c "import json;d=json.load(open('/tmp/vv5/package/package.json'));print('  版本:',d['version']);print('  描述:',d['description'])"

echo
echo "=== 2. GitHub Release latest 包 ==="
curl -sL -o b.tgz https://github.com/HEHE-HEHEz53/hopzz-site/releases/latest/download/dsh-web-relay-latest.tgz
echo "  大小: $(stat -c %s b.tgz) 字节"
rm -rf gh5 && mkdir gh5 && tar -xzf b.tgz -C gh5 package/package.json
python3 -c "import json;d=json.load(open('/tmp/vv5/gh5/package/package.json'));print('  版本:',d['version'])"

echo
echo "=== 3. 各地址 HTTP 状态 ==="
for u in \
  https://hopzz.top/dl/dsh-web-relay-latest.tgz \
  https://hopzz.top/dl/dsh-web-relay-5.0.0.tgz \
  https://github.com/HEHE-HEHEz53/hopzz-site/releases/latest/download/dsh-web-relay-latest.tgz \
  https://github.com/HEHE-HEHEz53/hopzz-site/releases/download/v5.0.0/dsh-web-relay-5.0.0.tgz
do
  printf '  %s  %s\n' "$(curl -sL -o /dev/null -w '%{http_code}' "$u")" "$u"
done

echo
echo "=== 4. 两个包是否一致 ==="
a=$(sha256sum a.tgz | cut -d' ' -f1); b=$(sha256sum b.tgz | cut -d' ' -f1)
echo "  自建:   $a"
echo "  GitHub: $b"
[ "$a" = "$b" ] && echo "  一致 ✓" || echo "  不一致 ✗"

echo
echo "=== 5. 安全自检：包内是否含令牌 ==="
rm -rf pkg && mkdir pkg && tar -xzf a.tgz -C pkg
if grep -rq '763bf0673f959943' pkg 2>/dev/null; then echo "  !! 含令牌"; else echo "  OK 无令牌"; fi
echo "  安全特性:"
grep -c 'isValidDeployAddr' pkg/package/index.js | sed 's/^/    地址白名单 /'
grep -c 'forbidden host' pkg/package/index.js | sed 's/^/    Host 校验 /'
grep -c 'findTool' pkg/package/index.js | sed 's/^/    findTool /'
grep -c "const VERSION = '5.0.0'" pkg/package/index.js | sed 's/^/    版本 5.0.0 /'

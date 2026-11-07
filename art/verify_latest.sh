#!/bin/bash
cd /tmp
rm -rf vp && mkdir vp && cd vp
curl -sL -o a.tgz https://hopzz.top/dl/dsh-web-relay-latest.tgz
echo "下载大小: $(stat -c %s a.tgz) 字节"
tar -xzf a.tgz package/package.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/vp/package/package.json'))
print('  包内版本:', d['version'])
print('  描述:', d['description'])
print('  含 PuTTY:', 'ok')
PY
echo
echo "=== 站点上的文件 ==="
ls -l /var/www/hopzz.top/dl/ | grep -E "latest|2\.9\.9|chat-src"
echo
echo "=== 各下载地址可达性 ==="
printf '  %s  /dl/latest\n'      "$(curl -s -o /dev/null -w '%{http_code}' https://hopzz.top/dl/dsh-web-relay-latest.tgz)"
printf '  %s  /dl/2.9.9\n'       "$(curl -s -o /dev/null -w '%{http_code}' https://hopzz.top/dl/dsh-web-relay-2.9.9.tgz)"
printf '  %s  github release latest\n' "$(curl -sL -o /dev/null -w '%{http_code}' https://github.com/HEHE-HEHEz53/hopzz-site/releases/latest/download/dsh-web-relay-latest.tgz)"
printf '  %s  github raw main\n' "$(curl -sL -o /dev/null -w '%{http_code}' https://raw.githubusercontent.com/HEHE-HEHEz53/hopzz-site/main/dist/dsh-web-relay-latest.tgz)"

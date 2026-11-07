#!/bin/bash
cd /tmp
rm -rf q5 && mkdir q5 && cd q5
curl -sL -o a.tgz https://hopzz.top/dl/dsh-web-relay-latest.tgz
curl -sL -o b.tgz https://github.com/HEHE-HEHEz53/hopzz-site/releases/latest/download/dsh-web-relay-latest.tgz
echo "站点包:   $(stat -c %s a.tgz) 字节"
echo "GitHub包: $(stat -c %s b.tgz) 字节"
rm -rf pa pb && mkdir pa pb
tar -xzf a.tgz -C pa
tar -xzf b.tgz -C pb
python3 - <<'PY'
import json
for name, path in [('自建', '/tmp/q5/pa/package/package.json'), ('GitHub', '/tmp/q5/pb/package/package.json')]:
    d = json.load(open(path))
    print('  %-8s 版本 %s' % (name, d['version']))
PY
echo
echo "指纹修复检查:"
grep -c 'ensureHostKey(plink' pa/package/index.js | sed 's/^/  ensureHostKey 传 plink 路径: /'
grep -c '拿不到主机指纹' pa/package/index.js | sed 's/^/  无指纹时明确提示: /'
echo
echo "哈希对比:"
sha256sum a.tgz | cut -c1-24 | sed 's/^/  自建:   /'
sha256sum b.tgz | cut -c1-24 | sed 's/^/  GitHub: /'

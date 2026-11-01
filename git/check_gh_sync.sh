#!/bin/bash
echo "=== 本地(自建)仓库里这个文件的 blob sha ==="
cd /srv/git-www 2>/dev/null || cd /root
cd /tmp && rm -rf hz && git clone -q /srv/git/hopzz-site.git hz 2>/dev/null
cd /tmp/hz && echo "  blob: $(git rev-parse HEAD:dist/dsh-web-relay-latest.tgz 2>/dev/null)"
echo "  提交: $(git log -1 --format='%h %s' -- dist/dsh-web-relay-latest.tgz 2>/dev/null)"

echo
echo "=== GitHub API 上的实际 blob sha ==="
python3 - <<'PY'
import json, urllib.request
tok = open('/root/.gh_token').read().strip()
url = 'https://api.github.com/repos/HEHE-HEHEz53/hopzz-site/contents/dist/dsh-web-relay-latest.tgz'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'dsh'})
try:
    d = json.load(urllib.request.urlopen(req, timeout=30))
    print("  sha: ", d['sha'])
    print("  size:", d['size'])
except Exception as e:
    print("  出错:", e)

print()
print("=== GitHub 最新提交 ===")
req = urllib.request.Request('https://api.github.com/repos/HEHE-HEHEz53/hopzz-site/commits?per_page=2',
                             headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'dsh'})
try:
    for c in json.load(urllib.request.urlopen(req, timeout=30)):
        print("  ", c['sha'][:9], c['commit']['message'].split('\n')[0][:60])
except Exception as e:
    print("  出错:", e)
PY

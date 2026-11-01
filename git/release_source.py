#!/usr/bin/env python3
import json, urllib.request, urllib.error
TOKEN = open('/root/.gh_token').read().strip()
REPO = 'HEHE-HEHEz53/hopzz-site'
TAG = 'v2.9.9'

def api(method, url, data=None, raw=False, ctype='application/json'):
    h = {'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'dsh', 'Accept': 'application/vnd.github+json'}
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        h['Content-Type'] = ctype
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            t = r.read()
            return r.status, (t if raw else (json.loads(t) if t else {}))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

st, rel = api('GET', f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}')
if st != 200:
    print('取 release 失败', st, str(rel)[:200]); raise SystemExit(1)
upload = rel['upload_url'].split('{')[0]

with open('/tmp/rel/chat-src.tar.gz', 'rb') as fh:
    content = fh.read()
for name in ['chat-src.tar.gz', f'chat-src-{TAG}.tar.gz']:
    st, out = api('POST', f'{upload}?name={name}', content, raw=True, ctype='application/octet-stream')
    if st in (200, 201):
        print('上传成功:', name, len(content), '字节')
    elif st == 422:
        print('已存在，跳过:', name)
    else:
        print('上传失败', st, str(out)[:200])

print()
print('源码包双线路:')
print(f'  https://hopzz.top/dl/chat-src.tar.gz')
print(f'  https://github.com/{REPO}/releases/latest/download/chat-src.tar.gz')

#!/usr/bin/env python3
import json, urllib.request, urllib.error
TOKEN = open('/root/.gh_token').read().strip()
REPO = 'HEHE-HEHEz53/hopzz-site'

def api(method, url, data=None):
    h = {'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'dsh', 'Accept': 'application/vnd.github+json'}
    body = json.dumps(data).encode() if data is not None else None
    if body:
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

st, lst = api('GET', 'https://api.github.com/repos/%s/releases' % REPO)
if st != 200:
    print('列 release 失败', st, str(lst)[:300]); raise SystemExit(1)

keep = 'v5.0.1'
for rel in lst:
    tag = rel['tag_name']
    if tag == keep:
        if rel['draft']:
            s, out = api('PATCH', 'https://api.github.com/repos/%s/releases/%d' % (REPO, rel['id']), {'draft': False})
            print('%s 取消草稿: %s' % (tag, s if s == 200 else str(out)[:200]))
        else:
            print('%s 已是正式版' % tag)
    else:
        # 老的草稿直接删掉，避免别人下到旧版
        s, out = api('DELETE', 'https://api.github.com/repos/%s/releases/%d' % (REPO, rel['id']))
        print('删除旧 release %s: %s' % (tag, s))

st, rel = api('GET', 'https://api.github.com/repos/%s/releases/latest' % REPO)
print('\nlatest 状态:', st)
if st == 200:
    print('  tag:', rel['tag_name'])
    for a in rel.get('assets', []):
        print('   -', a['name'], a['size'], '字节')

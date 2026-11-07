#!/usr/bin/env python3
import json, urllib.request, urllib.error
TOKEN = open('/root/.gh_token').read().strip()
REPO = 'HEHE-HEHEz53/hopzz-site'

def get(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + TOKEN,
                                               'User-Agent': 'dsh', 'Accept': 'application/vnd.github+json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

st, rel = get('https://api.github.com/repos/%s/releases/latest' % REPO)
print('latest 状态:', st)
if st == 200:
    print('  tag:', rel.get('tag_name'), '| draft:', rel.get('draft'), '| prerelease:', rel.get('prerelease'))
    print('  资产:')
    for a in rel.get('assets', []):
        print('   -', a['name'], a['size'], '字节')

st2, lst = get('https://api.github.com/repos/%s/releases?per_page=5' % REPO)
if st2 == 200:
    print('\n最近 releases:')
    for r in lst:
        print('  ', r['tag_name'], 'draft=%s prerelease=%s assets=%d' % (r['draft'], r['prerelease'], len(r['assets'])))
        for a in r['assets']:
            print('      -', a['name'], a['size'])

#!/usr/bin/env python3
import json, urllib.request, urllib.error

TOKEN = open('/root/.gh_token').read().strip()
REPO = 'HEHE-HEHEz53/hopzz-site'
VER = '2.9.9'
TAG = 'v' + VER

def api(method, url, data=None, raw=False, ctype='application/json'):
    h = {'Authorization': 'Bearer ' + TOKEN, 'User-Agent': 'dsh', 'Accept': 'application/vnd.github+json'}
    body = None
    if data is not None:
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        h['Content-Type'] = ctype
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            txt = r.read()
            return r.status, (txt if raw else (json.loads(txt) if txt else {}))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

# 1. 取 main 最新提交
st, ref = api('GET', f'https://api.github.com/repos/{REPO}/git/ref/heads/main')
if st != 200:
    print('取 main 失败', st, str(ref)[:300]); raise SystemExit(1)
sha = ref['object']['sha']
print('GitHub main HEAD:', sha)

# 2. 建 tag（已存在就跳过）
st, out = api('POST', f'https://api.github.com/repos/{REPO}/git/refs',
              {'ref': 'refs/tags/' + TAG, 'sha': sha})
print('建 tag:', st, '' if st in (201,) else str(out)[:200])

# 3. 建 release
st, rel = api('POST', f'https://api.github.com/repos/{REPO}/releases', {
    'tag_name': TAG,
    'name': f'鲸鱼娘在线插件 {VER}',
    'body': 'DSH 手机网页中继插件。下载 `dsh-web-relay-latest.tgz`，在 DSH 插件页导入即可。',
    'draft': False,
    'prerelease': False,
})
if st == 201:
    print('release 创建成功:', rel['html_url'])
elif st == 422:
    st2, rel = api('GET', f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}')
    if st2 != 200:
        print('release 仍失败', st, str(rel)[:300]); raise SystemExit(1)
    print('release 已存在:', rel['html_url'])
else:
    print('release 失败', st, str(rel)[:300]); raise SystemExit(1)

upload_url = rel['upload_url'].split('{')[0]
src = f'/tmp/rel/dsh-web-relay-{VER}.tgz'
with open(src, 'rb') as fh:
    content = fh.read()

for name in [f'dsh-web-relay-{VER}.tgz', 'dsh-web-relay-latest.tgz']:
    st, out = api('POST', f'{upload_url}?name={name}', content,
                  raw=True, ctype='application/octet-stream')
    if st in (200, 201):
        print('  上传成功:', name, len(content), '字节')
    elif st == 422:
        print('  已存在，跳过:', name)
    else:
        print('  上传失败', st, str(out)[:200])

print()
print('固定链接（永远指向最新 release）:')
print(f'  https://github.com/{REPO}/releases/latest/download/dsh-web-relay-latest.tgz')
print(f'版本固定链接:')
print(f'  https://github.com/{REPO}/releases/download/{TAG}/dsh-web-relay-{VER}.tgz')

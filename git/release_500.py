#!/usr/bin/env python3
import json, urllib.request, urllib.error

TOKEN = open('/root/.gh_token').read().strip()
REPO = 'HEHE-HEHEz53/hopzz-site'
VER = '5.0.0'
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
            t = r.read()
            return r.status, (t if raw else (json.loads(t) if t else {}))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')

st, ref = api('GET', f'https://api.github.com/repos/{REPO}/git/ref/heads/main')
if st != 200:
    print('取 main 失败', st, str(ref)[:200]); raise SystemExit(1)
sha = ref['object']['sha']
print('GitHub main:', sha)

api('POST', f'https://api.github.com/repos/{REPO}/git/refs', {'ref': 'refs/tags/' + TAG, 'sha': sha})

st, rel = api('POST', f'https://api.github.com/repos/{REPO}/releases', {
    'tag_name': TAG,
    'name': f'鲸鱼娘在线插件 {VER}',
    'body': '**5.0.0 安全加固版**\n\n- 修复 Windows 上无法一键部署（plink 解析 + 缺少工具时的提示）\n- 修复部署地址命令注入\n- 本地接口新增 Host / Sec-Fetch-Site 校验\n- settings.json 权限收紧到 600\n\n详见仓库 CHANGELOG.md。',
    'draft': False,
    'prerelease': False,
})
if st == 201:
    print('release 创建成功:', rel['html_url'])
elif st == 422:
    st2, rel = api('GET', f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}')
    if st2 != 200:
        print('release 失败', st, str(rel)[:300]); raise SystemExit(1)
    print('release 已存在:', rel['html_url'])
else:
    print('release 失败', st, str(rel)[:300]); raise SystemExit(1)

rel['html_url']
upload = rel['upload_url'].split('{')[0]
with open(f'/tmp/rel/dsh-web-relay-{VER}.tgz', 'rb') as fh:
    content = fh.read()
for name in [f'dsh-web-relay-{VER}.tgz', 'dsh-web-relay-latest.tgz']:
    st, out = api('POST', f'{upload}?name={name}', content, raw=True, ctype='application/octet-stream')
    print(('  上传成功: ' if st in (200, 201) else '  已存在或失败 %s: ' % st) + name)
print()
print('GitHub 链接:')
print(f'  https://github.com/{REPO}/releases/latest/download/dsh-web-relay-latest.tgz')
print(f'  https://github.com/{REPO}/releases/download/{TAG}/dsh-web-relay-{VER}.tgz')

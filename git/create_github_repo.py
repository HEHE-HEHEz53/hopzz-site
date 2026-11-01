"""用 GitHub API 建仓库（token 从环境变量读，不打印）。"""
import json
import os
import sys
import urllib.error
import urllib.request

TOKEN = os.environ.get("GH_TOKEN", "")
if not TOKEN:
    sys.exit("缺少 GH_TOKEN")

API = "https://api.github.com"


def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        API + path,
        method=method,
        data=body,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/vnd.github+json",
            "User-Agent": "dsh-agent",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            raw = resp.read().decode() or "{}"
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode() or "{}"
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}


status, user = api("GET", "/user")
if status != 200:
    print("认证失败:", status, user)
    sys.exit(1)
login = user.get("login", "")
print(f"已认证用户: {login}")
print(f"账号类型: {user.get('type')}")

name = "hopzz-site"
status, repo = api(
    "POST",
    "/user/repos",
    {
        "name": name,
        "description": "Hopzz 站点源码：个人主页 + 鲸鱼娘在线（手机版 DSH Harness）+ 硬件教程",
        "homepage": "https://hopzz.top",
        "private": False,
        "has_issues": True,
        "has_wiki": False,
        "has_projects": False,
        "auto_init": False,
    },
)
if status == 201:
    print(f"仓库已创建: {repo.get('full_name')}")
elif status == 422:
    print(f"仓库已存在（继续推送）: {login}/{name}")
    status, repo = api("GET", f"/repos/{login}/{name}")
else:
    print("创建失败:", status, repo)
    sys.exit(1)

print(f"克隆地址: {repo.get('clone_url')}")
print(f"网页地址: {repo.get('html_url')}")
print(f"默认分支: {repo.get('default_branch')}")

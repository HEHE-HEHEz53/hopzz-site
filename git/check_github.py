"""查询 GitHub 仓库状态（从服务器执行）。"""
import json
import os
import urllib.request

TOKEN = open("/root/.gh_token").read().strip()
REPO = "HEHE-HEHEz53/hopzz-site"


def api(path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/vnd.github+json",
            "User-Agent": "dsh-agent",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode() or "{}")


repo = api(f"/repos/{REPO}")
print("仓库:", repo.get("full_name"))
print("可见性:", "public" if not repo.get("private") else "private")
print("默认分支:", repo.get("default_branch"))
print("大小:", repo.get("size"), "KB")
print("地址:", repo.get("html_url"))
print()

branches = api(f"/repos/{REPO}/branches")
for b in branches:
    print(f"分支 {b['name']}: {b['commit']['sha'][:8]}  {b['commit']['commit']['message'].splitlines()[0][:60]}")

print()
commits = api(f"/repos/{REPO}/commits?per_page=5")
print(f"最近 {len(commits)} 个提交：")
for c in commits:
    print(f"  {c['sha'][:7]}  {c['commit']['message'].splitlines()[0][:56]}")

"""核对 GitHub 上公开的文件清单与敏感命中。"""
import json
import re
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
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or "{}")


repo = api(f"/repos/{REPO}")
print("仓库:", repo["full_name"], "| 可见性:", "public" if not repo["private"] else "private")
print("大小:", repo["size"], "KB | 默认分支:", repo["default_branch"])

branch = api(f"/repos/{REPO}/branches/{repo['default_branch']}")
sha = branch["commit"]["sha"]
tree = api(f"/repos/{REPO}/git/trees/{sha}?recursive=1")
paths = [e["path"] for e in tree["tree"] if e["type"] == "blob"]
print("公开文件数:", len(paths))
print("最新提交:", sha[:8], "|", branch["commit"]["commit"]["message"].splitlines()[0][:50])
print()

susp = [p for p in paths if re.search(
    r"(?i)(\.ssh|id_ed25519|id_rsa|\.env$|\.env\.|credentials|gh_token|\.pem$|\.key$|secret|\.npmrc)",
    p,
)]
print("== 敏感文件名检查 ==")
print("  命中:", susp if susp else "无")

print("\n== 公开文件清单 ==")
for p in sorted(paths):
    print("   ", p)
